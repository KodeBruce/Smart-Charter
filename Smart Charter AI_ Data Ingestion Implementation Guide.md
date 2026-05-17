# Smart Charter AI: Data Ingestion Implementation Guide

## 1. Introduction

This guide provides a detailed technical roadmap for ingesting multi-jurisdictional legal data into your Smart Charter AI RAG system. It outlines how to access authoritative legal data sources from the USA, UK, EU, and RSA, and integrate them into your Google Cloud Platform (GCP) based RAG architecture, leveraging your Node.js backend, Cloud Storage, and Vertex AI RAG Engine. The focus is on creating a robust, scalable, and compliant ingestion pipeline.

## 2. Overview of the Data Ingestion Pipeline

The data ingestion process for Smart Charter AI involves several key stages, designed to transform raw legal documents into a RAG-ready format within Vertex AI RAG Engine:

1.  **Source Identification**: Identifying and accessing official APIs or data portals for each jurisdiction.
2.  **Data Extraction**: Programmatically retrieving legal documents (e.g., statutes, regulations, contracts) from these sources.
3.  **Document Storage**: Storing raw or semi-processed documents in Google Cloud Storage (GCS) buckets, ensuring jurisdictional data residency.
4.  **Triggering Processing**: Initiating an asynchronous processing workflow (e.g., via Cloud Functions or Cloud Run) upon new document arrival in GCS.
5.  **Text Extraction & Reconstruction**: Extracting text from documents and reconstructing them into high-fidelity Markdown, often with the aid of Gemini models.
6.  **Metadata Extraction**: Identifying and attaching crucial metadata (jurisdiction, document type, date, etc.) to each document and its constituent chunks.
7.  **Chunking**: Breaking down large documents into smaller, semantically coherent chunks.
8.  **Embedding Generation**: Creating vector embeddings for each chunk using Vertex AI Embedding API.
9.  **Indexing**: Ingesting chunks, embeddings, and metadata into the appropriate Vertex AI RAG Engine Corpus.

## 3. Jurisdictional Data Sources and Access Methods

Below are the specific data sources for each target jurisdiction and recommended methods for programmatic access.

### 3.1 United States (USA)

*   **Source**: **SEC EDGAR Database** for material contracts.
*   **Access Method**: Use the [data.sec.gov API](https://data.sec.gov/) or a third-party wrapper like [SEC-API.io](https://sec-api.io/) for easier programmatic access. These APIs allow you to search and download filings, typically in XML or JSON formats, which can then be parsed to extract contract text.
*   **Implementation Notes**:
    *   **Rate Limits**: Be mindful of API rate limits. Implement exponential backoff and retry logic.
    *   **Parsing**: SEC filings can be complex. Focus on extracting the relevant contract sections (e.g., 10-K exhibits) and converting them to a clean text format before Markdown reconstruction.
    *   **Example (Node.js with `node-fetch` for `data.sec.gov`)**:
        ```javascript
        const fetch = require("node-fetch");

        async function fetchSECFiling(cik, formType, year) {
          const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
          const response = await fetch(url, {
            headers: {
              "User-Agent": "SmartCharterAI Contact@yourcompany.com", // Required by SEC
            },
          });
          const data = await response.json();

          // Parse data to find relevant filings (e.g., 10-K, 10-Q) and their URLs
          // This part requires detailed parsing of the SEC JSON structure
          // Example: find an exhibit with a contract and download its content
          return data; // Further processing needed to get document content
        }
        ```

### 3.2 United Kingdom (UK)

*   **Source**: **Legislation.gov.uk API** for statutes and statutory instruments.
*   **Access Method**: The [Legislation API](https://www.legislation.gov.uk/developer) provides access to consolidated UK legislation. You can query for specific legislation by title, year, or type, and retrieve content in XML or JSON formats.
*   **Implementation Notes**:
    *   **XML Parsing**: UK legislation is often available in Akoma Ntoso XML, which is a rich, structured format. You'll need an XML parser to extract text and preserve structural elements.
    *   **Versioning**: The API supports different versions of legislation (e.g., as enacted, as amended). Ensure you retrieve the appropriate version for your use case.
    *   **Example (Node.js with `axios` and `xml2js`)**:
        ```javascript
        const axios = require("axios");
        const xml2js = require("xml2js");

        async function fetchUKLegislation(legislationId) {
          const url = `https://www.legislation.gov.uk/ukpga/${legislationId}/data.xml`; // Example for Public General Act
          const response = await axios.get(url, {
            headers: { Accept: "application/xml" },
          });
          const parser = new xml2js.Parser();
          const result = await parser.parseStringPromise(response.data);
          // Process the XML to extract text and structure
          return result;
        }
        ```

### 3.3 European Union (EU)

*   **Source**: **EUR-Lex Webservice** or third-party **LexAPI**.
*   **Access Method**: The [EUR-Lex Webservice](https://eur-lex.europa.eu/content/help/data-reuse/webservice.html) is the official way to query EUR-Lex, though it uses SOAP/XML and requires registration. Alternatively, [LexAPI](https://www.lex-api.com/) offers a more modern REST API for easier integration, often providing content in JSON.
*   **Implementation Notes**:
    *   **Language**: EU law is multilingual. Decide on the primary language(s) for ingestion or implement language detection and processing.
    *   **Document Types**: EUR-Lex contains various document types (treaties, regulations, directives, case law). Filter for relevant types for contract management.
    *   **Example (Node.js with `axios` for LexAPI - assuming JSON output)**:
        ```javascript
        const axios = require("axios");

        async function fetchEULaw(documentId, apiKey) {
          const url = `https://api.lex-api.com/v1/eurlex/documents/${documentId}`; // Example LexAPI endpoint
          const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          return response.data; // JSON content of the EU legal document
        }
        ```

### 3.4 South Africa (RSA)

*   **Source**: **Laws.Africa Content API** and **Open Gazettes South Africa**.
*   **Access Method**: [Laws.Africa Content API](https://laws.africa/api/) provides machine-readable legislation in Akoma Ntoso XML. [Open Gazettes South Africa](https://opengazettes.org.za/) offers a collection of gazettes, often as PDFs, which may require OCR and text extraction.
*   **Implementation Notes**:
    *   **Akoma Ntoso XML**: Similar to UK legislation, this structured XML format requires careful parsing.
    *   **PDF Processing**: For Open Gazettes, you'll likely need to download PDFs and use a robust PDF text extraction library (e.g., `pdf-parse` in Node.js, or integrate with a Cloud Vision API for OCR) before further processing.
    *   **Example (Node.js with `axios` for Laws.Africa API)**:
        ```javascript
        const axios = require("axios");

        async function fetchSALegislation(legislationId) {
          const url = `https://api.laws.africa/v2/legislation/${legislationId}`; // Example Laws.Africa endpoint
          const response = await axios.get(url, {
            headers: { Accept: "application/xml" }, // Or application/json if available
          });
          return response.data; // XML or JSON content
        }
        ```

## 4. Implementing the Ingestion Pipeline

This section details the technical steps to implement the ingestion pipeline within your Smart Charter AI architecture.

### 4.1 Step 1: Securely Store API Keys

Store all API keys (for SEC, LexAPI, etc.) securely using Google Secret Manager. Your Cloud Functions/Run services and Node.js backend can then access these secrets at runtime.

*   **CLI Command to create a secret**:
    ```bash
    echo -n "your-sec-api-key" | gcloud secrets create SEC_API_KEY --data-file=- --project=YOUR_GCP_PROJECT_ID
    ```
*   **Access in Node.js (Cloud Function/Run)**:
    ```javascript
    // Ensure Secret Manager API is enabled
    const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
    const client = new SecretManagerServiceClient();

    async function accessSecret(name) {
      const [version] = await client.accessSecretVersion({
        name: `projects/YOUR_GCP_PROJECT_ID/secrets/${name}/versions/latest`,
      });
      return version.payload.data.toString();
    }
    // Usage: const secApiKey = await accessSecret("SEC_API_KEY");
    ```

### 4.2 Step 2: Cloud Storage for Raw Documents

Create regional GCS buckets for storing raw legal documents, ensuring data residency.

*   **CLI Command to create a regional bucket**:
    ```bash
    gcloud storage buckets create gs://smart-charter-ai-usa-raw-docs --project=YOUR_GCP_PROJECT_ID --location=US-CENTRAL1
    gcloud storage buckets create gs://smart-charter-ai-uk-raw-docs --project=YOUR_GCP_PROJECT_ID --location=EUROPE-WEST2
    # Repeat for EU (EUROPE-WEST1) and RSA (SOUTHAFRICA-NORTH1)
    ```

### 4.3 Step 3: Cloud Function/Run for Document Processing

Deploy a Cloud Function or Cloud Run service that triggers on new objects in your GCS buckets. This service will orchestrate the processing steps.

*   **`index.js` (Cloud Function Example)**:
    ```javascript
    const { Storage } = require("@google-cloud/storage");
    const { TextServiceClient } = require("@google-cloud/aiplatform");
    const { SearchServiceClient } = require("@google-cloud/discoveryengine");
    const officeparser = require("officeparser"); // You might need to bundle this or use a custom runtime
    const { GenerativeModel } = require("@google/generative-ai");

    const storage = new Storage();
    const textServiceClient = new TextServiceClient();
    const searchServiceClient = new SearchServiceClient();
    const genAI = new GenerativeModel({ model: "gemini-1.5-pro" });

    exports.processLegalDocument = async (file, context) => {
      const bucketName = file.bucket;
      const fileName = file.name;
      const filePath = `gs://${bucketName}/${fileName}`;

      console.log(`Processing file: ${filePath}`);

      // 1. Determine Jurisdiction from bucket name or metadata
      let jurisdiction;
      if (bucketName.includes("usa")) jurisdiction = "USA";
      else if (bucketName.includes("uk")) jurisdiction = "UK";
      // ... other jurisdictions
      else { console.error("Unknown jurisdiction for bucket:", bucketName); return; }

      // 2. Download document from GCS
      const [fileBuffer] = await storage.bucket(bucketName).file(fileName).download();

      // 3. Extract Text (handle PDF, Word, XML etc.)
      let rawText;
      if (fileName.endsWith(".pdf")) {
        // Use a PDF parsing library or Cloud Vision API for OCR
        // For simplicity, let's assume a basic text extraction for now
        rawText = "Extracted text from PDF"; // Replace with actual PDF parsing
      } else if (fileName.endsWith(".docx")) {
        rawText = await officeparser.parse(fileBuffer); // Requires officeparser setup
      } else if (fileName.endsWith(".xml")) {
        // Parse XML (e.g., Akoma Ntoso) to extract text and structure
        rawText = "Extracted text from XML"; // Replace with actual XML parsing
      } else {
        rawText = fileBuffer.toString("utf8");
      }

      // 4. High-Fidelity Markdown Reconstruction & Metadata Extraction (using Gemini)
      const reconstructionPrompt = `Reconstruct the following raw legal text into high-fidelity Markdown, preserving all headings, lists, and formatting. Also, extract key metadata as a JSON object at the beginning of the Markdown, including 'document_type', 'jurisdiction', 'effective_date' (YYYY-MM-DD), 'parties', and 'summary'.

Raw Text:\n${rawText}`;

      const geminiResponse = await genAI.generateContent(reconstructionPrompt);
      const fullMarkdownContent = geminiResponse.response.text();

      // Parse out metadata and actual markdown content
      const metadataMatch = fullMarkdownContent.match(/```json\n([\s\S]*?)\n```/);
      let metadata = {};
      let markdownContent = fullMarkdownContent;
      if (metadataMatch && metadataMatch[1]) {
        try {
          metadata = JSON.parse(metadataMatch[1]);
          markdownContent = fullMarkdownContent.replace(metadataMatch[0], "").trim();
        } catch (e) {
          console.error("Failed to parse metadata JSON:", e);
        }
      }

      // 5. Chunking Strategy (Example: simple paragraph chunking)
      const paragraphs = markdownContent.split(/\n\s*\n/);
      const chunks = paragraphs.map((p, i) => ({
        id: `${fileName}_chunk_${i}`,
        text: p.trim(),
        jurisdiction: jurisdiction,
        doc_type: metadata.document_type || "unknown",
        // Add other metadata as needed
      })).filter(chunk => chunk.text.length > 0);

      // 6. Generate Embeddings for each chunk
      const embeddingRequests = chunks.map(chunk => ({
        model: "text-embedding-004",
        text: chunk.text,
      }));
      const embeddingResponses = await Promise.all(embeddingRequests.map(req => textServiceClient.embedText(req)));
      const embeddings = embeddingResponses.map(res => res.embeddings[0]);

      // 7. Ingest into Vertex AI RAG Engine Corpus
      const corpusParent = searchServiceClient.corpusPath(process.env.GCP_PROJECT_ID, `my-${jurisdiction.toLowerCase()}-legal-corpus`);

      const documentsToIngest = chunks.map((chunk, i) => ({
        id: chunk.id,
        content: { content: chunk.text },
        embedding: embeddings[i],
        structData: { ...chunk, original_file: fileName }, // Store all metadata
      }));

      await searchServiceClient.importDocuments({
        parent: corpusParent,
        documents: documentsToIngest,
      });

      console.log(`Successfully processed ${chunks.length} chunks for ${fileName} into ${jurisdiction} corpus.`);
    };
    ```

*   **Deployment**: Deploy this Cloud Function, ensuring it has access to Secret Manager and the Vertex AI RAG Engine. Remember to set environment variables like `GCP_PROJECT_ID` and potentially `GEMINI_API_KEY` if not using a service account with Gemini access.

### 4.4 Step 4: Automate Ingestion with Manus CLI (Optional but Recommended)

Use Manus to schedule periodic checks of external data sources and trigger the ingestion pipeline.

*   **Scenario**: You want to regularly check for new legislation on `legislation.gov.uk` or new SEC filings.
*   **Manus Schedule**: Create a Manus scheduled task that runs a custom script. This script would:
    1.  Call the relevant jurisdictional API (e.g., `legislation.gov.uk`).
    2.  Identify new or updated documents.
    3.  Download these documents.
    4.  Upload them to the appropriate regional GCS bucket, which in turn triggers your Cloud Function.

    ```bash
    # Example Manus scheduled task (script to be created separately)
    manus-config schedule create \
        --name "ScheduledSECIngestion" \
        --interval "daily" \
        --command "node /home/ubuntu/scripts/fetch_sec_filings.js" \
        --project-id YOUR_MANUS_PROJECT_ID

    manus-config schedule create \
        --name "ScheduledUKLegislationUpdate" \
        --interval "weekly" \
        --command "node /home/ubuntu/scripts/fetch_uk_legislation.js" \
        --project-id YOUR_MANUS_PROJECT_ID
    ```

## 5. VS Code Development and Debugging

*   **Local Testing**: For local development, you can simulate GCS triggers and Cloud Function execution. Use tools like `gcloud functions deploy --trigger-http` for HTTP-triggered functions, or local emulators.
*   **Debugging**: Set breakpoints in your Node.js code (both backend and Cloud Functions) within VS Code. Use the `launch.json` configuration to attach the debugger to your running processes.
*   **AI Assistance**: Leverage AI coding assistants to help write API client code, parse complex XML/JSON structures, and refine chunking logic.

## 6. Error Handling and Monitoring

*   **Logging**: Implement comprehensive logging in your Cloud Functions and backend services using Google Cloud Logging. Log successful ingestions, errors, and any parsing issues.
*   **Alerting**: Set up Cloud Monitoring alerts for Cloud Function errors, high latency, or failed ingestion jobs. Integrate these alerts with your preferred notification channels.
*   **Retry Mechanisms**: Implement retry logic with exponential backoff for external API calls and GCS operations to handle transient failures.
*   **Dead-Letter Queues (DLQ)**: For critical ingestion failures, configure a DLQ (e.g., a Cloud Pub/Sub topic) to capture messages for later inspection and reprocessing.

## 7. Conclusion

By following this guide, you can establish a robust and scalable data ingestion pipeline for your Smart Charter AI. This approach ensures that your RAG system is continuously fed with up-to-date, jurisdictionally relevant legal data, enabling high-fidelity retrieval and accurate responses from your Gemini models. The combination of programmatic access, cloud services, and automation tools provides a powerful framework for managing your multi-jurisdictional legal corpus.

## 8. References

[1] SEC. *data.sec.gov*. Available at: [https://data.sec.gov/]
[2] SEC. *EDGAR API Development Toolkit*. Available at: [https://api.edgarfiling.sec.gov/]
[3] SEC-API.io. *SEC EDGAR Filings API*. Available at: [https://sec-api.io/]
[4] The National Archives. *Legislation API*. Available at: [https://www.legislation.gov.uk/index]
[5] The National Archives. *OpenAPI*. Available at: [https://www.legislation.gov.uk/openapi]
[6] The National Archives. *Developer Zone*. Available at: [https://www.legislation.gov.uk/developer]
[7] European Union. *Webservice - EUR-Lex*. Available at: [https://eur-lex.europa.eu/content/help/data-reuse/webservice.html]
[8] LexAPI. *EUR-Lex REST API*. Available at: [https://www.lex-api.com/]
[9] European Union. *Reuse EUR-Lex content*. Available at: [https://eur-lex.europa.eu/content/help/data-reuse/reuse-contents-eurlex-details.html]
[10] Laws.Africa. *Content API*. Available at: [https://laws.africa/api/]
[11] Laws.Africa. *Introduction - Laws.Africa Developer Guide*. Available at: [https://developers.laws.africa/get-started/overview]
[12] Open Gazettes South Africa. *Open Gazettes South Africa*. Available at: [https://opengazettes.org.za/]
[13] Google Cloud. *gcloud CLI overview*. Available at: [https://cloud.google.com/sdk/gcloud/reference]
[14] Google Cloud. *Cloud Storage client libraries*. Available at: [https://cloud.google.com/storage/docs/reference/libraries]
[15] Google Cloud. *Vertex AI Client Libraries*. Available at: [https://cloud.google.com/vertex-ai/docs/start/client-libraries]
[16] Google Cloud. *Generative AI with Gemini on Google Cloud*. Available at: [https://cloud.google.com/vertex-ai/docs/generative-ai/learn/overview]
[17] Google Cloud. *Secret Manager overview*. Available at: [https://cloud.google.com/secret-manager/docs/overview]
[18] Google Cloud. *Cloud Storage locations*. Available at: [https://cloud.google.com/storage/docs/locations]
[19] Google Cloud. *Cloud Functions overview*. Available at: [https://cloud.google.com/functions/docs/overview]
[20] Google Cloud. *Cloud Run overview*. Available at: [https://cloud.google.com/run/docs/overview]
[21] Google Cloud. *Vertex AI RAG Engine overview*. Available at: [https://cloud.google.com/vertex-ai/generative-ai/docs/rag-engine/rag-overview]
[22] Google Cloud. *Get text embeddings*. Available at: [https://cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-text-embeddings]
[23] Google Cloud. *Cloud Logging overview*. Available at: [https://cloud.google.com/logging/docs/overview]
[24] Google Cloud. *Cloud Monitoring overview*. Available at: [https://cloud.google.com/monitoring/docs/overview]
[25] Google Cloud. *Cloud Pub/Sub overview*. Available at: [https://cloud.google.com/pubsub/docs/overview]

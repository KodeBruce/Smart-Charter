import fs from 'fs';

let content = fs.readFileSync('src/views/ESign.tsx', 'utf8');

content = content.replaceAll('bg-[#080808]', 'bg-surface');
content = content.replaceAll('bg-[#0D0D0D]', 'bg-surface-container-low');
content = content.replaceAll('bg-[#111111]', 'bg-surface-container');
content = content.replaceAll('bg-black', 'bg-surface-container');

// General text and borders
content = content.replaceAll('text-white/40', 'text-on-surface-variant');
content = content.replaceAll('text-white/30', 'text-on-surface-variant');
content = content.replaceAll('text-white/20', 'text-on-surface-variant/70');
content = content.replaceAll('text-white/10', 'text-on-surface-variant/50');
content = content.replaceAll('border-white/5', 'border-outline/50');
content = content.replaceAll('border-white/10', 'border-outline');
content = content.replaceAll('border-white/20', 'border-outline-variant');
content = content.replaceAll('bg-white/5', 'bg-surface-container-high');
content = content.replaceAll('bg-white/10', 'bg-outline/50');
content = content.replaceAll('bg-white/[0.02]', 'bg-surface-container');

// Handle raw white text
content = content.replaceAll('text-white', 'text-on-surface');
content = content.replaceAll('bg-primary text-on-surface', 'bg-primary text-white');
content = content.replaceAll('bg-error text-on-surface', 'bg-error text-white');
content = content.replaceAll('text-on-surface shadow-xl shadow-primary', 'text-white shadow-xl shadow-primary');

// Responsiveness: flex-col md:flex-row on main content
content = content.replaceAll('className="flex-1 flex overflow-hidden"', 'className="flex-1 flex flex-col md:flex-row overflow-hidden"');
content = content.replaceAll('className="w-[400px] border-r border-outline/50 bg-surface-container-low flex flex-col"', 'className="w-full md:w-[400px] border-b md:border-b-0 md:border-r border-outline/50 bg-surface-container-low flex flex-col"');
content = content.replaceAll('className="flex-1 flex overflow-hidden"', 'className="flex-1 flex flex-col md:flex-row overflow-hidden"');
content = content.replaceAll('w-full max-w-lg', 'w-[90%] md:w-full max-w-lg mx-4');

fs.writeFileSync('src/views/ESign.tsx', content);
console.log('Replacements done.');

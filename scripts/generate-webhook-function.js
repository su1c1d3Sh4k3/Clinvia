const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Script to generate and deploy a dedicated webhook Edge Function for a Uzapi instance
 * Usage: node scripts/generate-webhook-function.js <instance-name>
 */

const instanceName = process.argv[2];

if (!instanceName) {
    console.error('❌ Error: Instance name is required');
    console.log('Usage: node scripts/generate-webhook-function.js <instance-name>');
    process.exit(1);
}

// Sanitize instance name for function name
const sanitizedName = instanceName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
const functionName = `uzapi-webhook-${sanitizedName}`;
const functionsDir = path.join(__dirname, '..', 'supabase', 'functions');
const templatePath = path.join(functionsDir, '_webhook-template', 'index.ts');
const targetDir = path.join(functionsDir, functionName);
const targetFile = path.join(targetDir, 'index.ts');

console.log(`\n📦 Generating webhook function for instance: ${instanceName}`);
console.log(`Function name: ${functionName}\n`);

// Step 1: Create function directory
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`✅ Created directory: ${targetDir}`);
} else {
    console.log(`ℹ️  Directory already exists: ${targetDir}`);
}

// Step 2: Read template
if (!fs.existsSync(templatePath)) {
    console.error(`❌ Template not found: ${templatePath}`);
    process.exit(1);
}

let templateContent = fs.readFileSync(templatePath, 'utf-8');

// Step 3: Replace placeholder with actual instance name
templateContent = templateContent.replace(/{{INSTANCE_NAME}}/g, instanceName);

// Step 4: Write to target file
fs.writeFileSync(targetFile, templateContent);
console.log(`✅ Generated function file: ${targetFile}`);

// Step 5: Deploy function
console.log(`\n🚀 Deploying function to Supabase...\n`);

try {
    execSync(`npx supabase functions deploy ${functionName} --no-verify-jwt`, {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit'
    });

    console.log(`\n✅ Successfully deployed: ${functionName}`);
    console.log(`📍 Webhook URL: https://swfshqvvbohnahdyndch.supabase.co/functions/v1/${functionName}\n`);
} catch (error) {
    console.error(`\n❌ Failed to deploy function: ${error.message}`);
    process.exit(1);
}

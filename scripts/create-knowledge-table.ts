import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

function parseDotEnv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

let envVars: Record<string, string> = {};
try {
  const envContent = readFileSync(resolve(PROJECT_ROOT, ".env.local"), "utf-8");
  envVars = parseDotEnv(envContent);
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || envVars.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY;

const supa = createClient(url, key)

async function run() {
  console.log('Checking Supabase connection to:', url)

  // Test inserting a row directly to sw_knowledge using service role
  // Service role bypasses RLS and can auto-create or verify table exists
  const testRow = {
    created_by: '00000000-0000-0000-0000-000000000000',
    title: 'Init Table Test',
    content: 'Test content',
    source_type: 'manual',
    tags: ['test'],
    metadata: {},
  }

  const { data, error } = await supa.from('sw_knowledge').insert(testRow).select()
  
  if (error) {
    console.log('Error inserting:', error)
    if (error.code === '42P01') {
      console.log('\n========================================')
      console.log('TABLE sw_knowledge DOES NOT EXIST YET ON SUPABASE!')
      console.log('========================================\n')
    }
  } else {
    console.log('Successfully inserted test row:', data)
    // Cleanup test row
    if (data && data[0]) {
      await supa.from('sw_knowledge').delete().eq('id', data[0].id)
    }
  }
}

run()

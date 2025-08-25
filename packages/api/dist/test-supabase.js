#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
async function testConnection() {
    console.log('🔍 Testing Supabase Connection...\n');
    if (!process.env.SUPABASE_URL) {
        console.error('❌ SUPABASE_URL not found in environment variables');
        console.log('   Please ensure .env file exists in project root with Supabase credentials');
        process.exit(1);
    }
    if (!process.env.SUPABASE_ANON_KEY) {
        console.error('❌ SUPABASE_ANON_KEY not found in environment variables');
        console.log('   Please ensure .env file exists in project root with Supabase credentials');
        process.exit(1);
    }
    const sharedModule = await import('@aizen/shared');
    const { supabase, supabaseAdmin } = sharedModule;
    try {
        console.log('1. Testing anonymous connection...');
        const { error: anonError } = await supabase
            .from('customers')
            .select('count')
            .limit(1);
        if (anonError) {
            console.log('   ❌ Anonymous connection failed:', anonError.message);
        }
        else {
            console.log('   ✅ Anonymous connection successful');
        }
        if (supabaseAdmin) {
            console.log('\n2. Testing service role connection...');
            const { data: customers, error: serviceError } = await supabaseAdmin
                .from('customers')
                .select('id, name, email')
                .limit(3);
            if (serviceError) {
                console.log('   ❌ Service role connection failed:', serviceError.message);
            }
            else {
                console.log('   ✅ Service role connection successful');
                console.log('   Found', customers?.length ?? 0, 'customers');
                customers?.forEach((c) => {
                    const customer = c;
                    console.log(`   - ${customer.name ?? 'Unknown'} (${customer.email ?? 'No email'})`);
                });
            }
        }
        else {
            console.log('\n2. Service role key not configured (SUPABASE_SERVICE_KEY missing)');
        }
        console.log('\n3. Testing auth configuration...');
        const { data: session, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
            console.log('   ❌ Auth check failed:', sessionError.message);
        }
        else {
            console.log('   ✅ Auth system accessible');
            console.log('   Current session:', session.session ? 'Active' : 'None');
        }
        if (supabaseAdmin) {
            console.log('\n4. Testing database functions...');
            const { data: health, error: healthError } = await supabaseAdmin.rpc('analyze_table_health');
            if (healthError) {
                console.log('   ❌ Function call failed:', healthError.message);
            }
            else {
                console.log('   ✅ Database functions accessible');
                const healthData = health;
                console.log('   Tables in database:', Array.isArray(healthData) ? healthData.length : 0);
            }
        }
        console.log('\n5. Testing real-time configuration...');
        const channel = supabase.channel('test-channel');
        const subscribeResult = await new Promise(resolve => {
            channel.subscribe(status => {
                resolve(status);
            });
        });
        if (subscribeResult === 'SUBSCRIBED') {
            console.log('   ✅ Real-time subscriptions working');
            await supabase.removeChannel(channel);
        }
        else {
            console.log('   ❌ Real-time subscription failed:', subscribeResult);
        }
        console.log('\n✨ Supabase connection test complete!');
    }
    catch (error) {
        console.error('\n❌ Unexpected error during testing:', error);
    }
    process.exit(0);
}
void testConnection();
//# sourceMappingURL=test-supabase.js.map
import { createClient } from '@supabase/supabase-js';
let _supabase = null;
let _supabaseAdmin = null;
function getEnvVars() {
    const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        '';
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';
    return { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY };
}
export function getSupabase() {
    if (!_supabase) {
        const { SUPABASE_URL, SUPABASE_ANON_KEY } = getEnvVars();
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            throw new Error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_ANON_KEY');
        }
        _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
            },
            realtime: {
                params: {
                    eventsPerSecond: 10,
                },
            },
        });
    }
    return _supabase;
}
export function getSupabaseAdmin() {
    if (!_supabaseAdmin) {
        const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = getEnvVars();
        if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
            return null;
        }
        _supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
    }
    return _supabaseAdmin;
}
export const supabase = new Proxy({}, {
    get(_target, prop, receiver) {
        const client = getSupabase();
        return Reflect.get(client, prop, receiver);
    },
});
const supabaseAdminProxy = {};
export const supabaseAdmin = new Proxy(supabaseAdminProxy, {
    get(_target, prop, receiver) {
        const client = getSupabaseAdmin();
        if (!client)
            return null;
        return Reflect.get(client, prop, receiver);
    },
});
export function createSupabaseClient(accessToken) {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = getEnvVars();
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_ANON_KEY');
    }
    if (accessToken) {
        return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
    }
    return getSupabase();
}
export const auth = {
    async signInWithOTP(email) {
        const { data, error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: false,
            },
        });
        return { data, error };
    },
    async verifyOTP(email, token) {
        const { data, error } = await supabase.auth.verifyOtp({
            email,
            token,
            type: 'email',
        });
        return { data, error };
    },
    async signOut() {
        const { error } = await supabase.auth.signOut();
        return { error };
    },
    async getSession() {
        const { data, error } = await supabase.auth.getSession();
        return { data, error };
    },
    async getUser() {
        const { data, error } = await supabase.auth.getUser();
        return { data, error };
    },
    async refreshSession() {
        const { data, error } = await supabase.auth.refreshSession();
        return { data, error };
    },
};
export const db = {
    customers: supabase.from('customers'),
    users: supabase.from('users'),
    devices: supabase.from('devices'),
    diagnosticSessions: supabase.from('diagnostic_sessions'),
    remediationActions: supabase.from('remediation_actions'),
    auditLogs: supabase.from('audit_logs'),
    networkDiagnostics: supabase.from('network_diagnostics'),
    alerts: supabase.from('alerts'),
};
export const realtime = {
    subscribeToDeviceStatus(customerId, callback) {
        return supabase
            .channel(`devices:${customerId}`)
            .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'devices',
            filter: `customer_id=eq.${customerId}`,
        }, callback)
            .subscribe();
    },
    subscribeToSessions(customerId, callback) {
        return supabase
            .channel(`sessions:${customerId}`)
            .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'diagnostic_sessions',
            filter: `customer_id=eq.${customerId}`,
        }, callback)
            .subscribe();
    },
    subscribeToAlerts(customerId, callback) {
        return supabase
            .channel(`alerts:${customerId}`)
            .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'alerts',
            filter: `customer_id=eq.${customerId}`,
        }, callback)
            .subscribe();
    },
    unsubscribe(channel) {
        return supabase.removeChannel(channel);
    },
};
export const storage = {
    async uploadFile(bucket, path, file) {
        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(path, file);
        return { data, error };
    },
    getPublicUrl(bucket, path) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        return data.publicUrl;
    },
    async deleteFile(bucket, paths) {
        const { data, error } = await supabase.storage.from(bucket).remove(paths);
        return { data, error };
    },
};
//# sourceMappingURL=supabase.js.map
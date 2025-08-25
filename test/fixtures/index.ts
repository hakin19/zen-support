import { faker } from '@faker-js/faker';

// Customer fixtures
export const createMockCustomer = (overrides = {}) => ({
  id: faker.string.uuid(),
  name: faker.company.name(),
  email: faker.internet.email(),
  phone: faker.phone.number(),
  status: 'active',
  plan_type: 'professional',
  created_at: faker.date.past().toISOString(),
  updated_at: faker.date.recent().toISOString(),
  ...overrides,
});

// User fixtures
export const createMockUser = (overrides = {}) => ({
  id: faker.string.uuid(),
  customer_id: faker.string.uuid(),
  email: faker.internet.email(),
  name: faker.person.fullName(),
  role: faker.helpers.arrayElement(['admin', 'technician', 'viewer']),
  status: 'active',
  created_at: faker.date.past().toISOString(),
  updated_at: faker.date.recent().toISOString(),
  ...overrides,
});

// Device fixtures
export const createMockDevice = (overrides = {}) => ({
  id: faker.string.uuid(),
  customer_id: faker.string.uuid(),
  device_id: `DEV-${faker.string.alphanumeric(8).toUpperCase()}`,
  name: faker.helpers.arrayElement([
    'Main Router',
    'Branch Gateway',
    'Edge Device',
  ]),
  type: 'raspberry-pi',
  status: faker.helpers.arrayElement(['online', 'offline', 'maintenance']),
  last_heartbeat: faker.date.recent().toISOString(),
  firmware_version: faker.system.semver(),
  location: faker.location.city(),
  network_info: {
    ip_address: faker.internet.ip(),
    mac_address: faker.internet.mac(),
    gateway: faker.internet.ip(),
    dns_servers: [faker.internet.ip(), faker.internet.ip()],
  },
  created_at: faker.date.past().toISOString(),
  updated_at: faker.date.recent().toISOString(),
  ...overrides,
});

// Diagnostic session fixtures
export const createMockDiagnosticSession = (overrides = {}) => ({
  id: faker.string.uuid(),
  device_id: faker.string.uuid(),
  initiated_by: faker.string.uuid(),
  type: faker.helpers.arrayElement(['manual', 'scheduled', 'triggered']),
  status: faker.helpers.arrayElement([
    'pending',
    'running',
    'completed',
    'failed',
  ]),
  diagnostics_data: {
    ping: {
      target: faker.internet.domainName(),
      packet_loss: faker.number.int({ min: 0, max: 100 }),
      avg_latency: faker.number.float({ min: 1, max: 200, precision: 0.1 }),
    },
    traceroute: {
      target: faker.internet.domainName(),
      hops: faker.number.int({ min: 1, max: 30 }),
    },
    bandwidth: {
      download: faker.number.float({ min: 10, max: 1000, precision: 0.1 }),
      upload: faker.number.float({ min: 5, max: 500, precision: 0.1 }),
    },
  },
  ai_analysis: faker.lorem.paragraph(),
  recommendations: faker.lorem.sentences(3).split('. '),
  started_at: faker.date.recent().toISOString(),
  completed_at: faker.date.recent().toISOString(),
  ...overrides,
});

// Remediation action fixtures
export const createMockRemediationAction = (overrides = {}) => ({
  id: faker.string.uuid(),
  session_id: faker.string.uuid(),
  action_type: faker.helpers.arrayElement([
    'restart_service',
    'update_config',
    'clear_cache',
    'reset_connection',
  ]),
  description: faker.lorem.sentence(),
  script: faker.helpers.arrayElement([
    'sudo systemctl restart networking',
    'sudo ip link set dev eth0 down && sudo ip link set dev eth0 up',
    'sudo iptables -F',
  ]),
  requires_approval: faker.datatype.boolean(),
  approval_status: faker.helpers.arrayElement([
    'pending',
    'approved',
    'rejected',
    null,
  ]),
  approved_by: faker.datatype.boolean() ? faker.string.uuid() : null,
  executed_at: faker.datatype.boolean()
    ? faker.date.recent().toISOString()
    : null,
  execution_result: faker.helpers.arrayElement([
    'success',
    'failed',
    'partial',
    null,
  ]),
  created_at: faker.date.past().toISOString(),
  ...overrides,
});

// Alert fixtures
export const createMockAlert = (overrides = {}) => ({
  id: faker.string.uuid(),
  customer_id: faker.string.uuid(),
  device_id: faker.string.uuid(),
  type: faker.helpers.arrayElement([
    'connectivity',
    'performance',
    'security',
    'configuration',
  ]),
  severity: faker.helpers.arrayElement(['low', 'medium', 'high', 'critical']),
  title: faker.lorem.sentence(),
  description: faker.lorem.paragraph(),
  status: faker.helpers.arrayElement([
    'open',
    'acknowledged',
    'resolved',
    'closed',
  ]),
  metadata: {
    source: faker.helpers.arrayElement([
      'monitoring',
      'ai_detection',
      'user_report',
    ]),
    affected_services: faker.helpers.arrayElements(
      ['internet', 'vpn', 'dns', 'firewall'],
      2
    ),
  },
  created_at: faker.date.past().toISOString(),
  resolved_at: faker.datatype.boolean()
    ? faker.date.recent().toISOString()
    : null,
  ...overrides,
});

// Network diagnostic fixtures
export const createMockNetworkDiagnostic = (overrides = {}) => ({
  id: faker.string.uuid(),
  device_id: faker.string.uuid(),
  diagnostic_type: faker.helpers.arrayElement([
    'ping',
    'traceroute',
    'dns_lookup',
    'port_scan',
    'bandwidth_test',
  ]),
  target: faker.internet.domainName(),
  result: {
    success: faker.datatype.boolean(),
    response_time: faker.number.float({ min: 1, max: 1000, precision: 0.1 }),
    details: faker.lorem.sentence(),
  },
  timestamp: faker.date.recent().toISOString(),
  ...overrides,
});

// Batch creation helpers
export const createMockCustomers = (count = 5) =>
  Array.from({ length: count }, () => createMockCustomer());

export const createMockUsers = (count = 10, customerId?: string) =>
  Array.from({ length: count }, () =>
    createMockUser(customerId ? { customer_id: customerId } : {})
  );

export const createMockDevices = (count = 3, customerId?: string) =>
  Array.from({ length: count }, () =>
    createMockDevice(customerId ? { customer_id: customerId } : {})
  );

// Test data scenarios
export const createTestScenario = () => {
  const customer = createMockCustomer();
  const users = createMockUsers(3, customer.id);
  const devices = createMockDevices(2, customer.id);
  const sessions = devices.map(device =>
    createMockDiagnosticSession({
      device_id: device.id,
      initiated_by: users[0].id,
    })
  );
  const alerts = devices.map(device =>
    createMockAlert({
      customer_id: customer.id,
      device_id: device.id,
    })
  );

  return {
    customer,
    users,
    devices,
    sessions,
    alerts,
  };
};

// Type for Supabase client (simplified for testing)
interface SupabaseTestClient {
  from: (table: string) => {
    insert: (data: unknown) => Promise<{ error: Error | null }>;
    delete: () => {
      eq: (column: string, value: string) => Promise<{ error: Error | null }>;
    };
  };
}

// Database seeding helper
export const seedTestDatabase = async (
  supabaseClient: SupabaseTestClient
): Promise<ReturnType<typeof createTestScenario>> => {
  const scenario = createTestScenario();

  // Insert test data
  const { error: customerError } = await supabaseClient
    .from('customers')
    .insert(scenario.customer);

  if (customerError) throw customerError;

  const { error: usersError } = await supabaseClient
    .from('users')
    .insert(scenario.users);

  if (usersError) throw usersError;

  const { error: devicesError } = await supabaseClient
    .from('devices')
    .insert(scenario.devices);

  if (devicesError) throw devicesError;

  return scenario;
};

// Cleanup helper
export const cleanupTestDatabase = async (
  supabaseClient: SupabaseTestClient,
  customerId: string
): Promise<void> => {
  // Delete in reverse order of dependencies
  await supabaseClient.from('alerts').delete().eq('customer_id', customerId);
  await supabaseClient
    .from('remediation_actions')
    .delete()
    .eq('customer_id', customerId);
  await supabaseClient
    .from('diagnostic_sessions')
    .delete()
    .eq('customer_id', customerId);
  await supabaseClient.from('devices').delete().eq('customer_id', customerId);
  await supabaseClient.from('users').delete().eq('customer_id', customerId);
  await supabaseClient.from('customers').delete().eq('id', customerId);
};

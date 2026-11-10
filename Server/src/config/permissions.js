// Every capability the admin area checks. Roles are stored in the database
// (admin_roles) and can be edited from Admin → Access control; this file only defines
// what can be granted and the defaults seeded on first run.
const PERMISSIONS = [
  { key: "dashboard.view", group: "Store", label: "View dashboard", description: "Sales overview, charts and recent orders." },
  { key: "products.manage", group: "Store", label: "Manage products", description: "Create, edit and delete products, images and videos." },
  { key: "testimonials.manage", group: "Store", label: "Manage testimonials", description: "Create, edit, publish and delete testimonials." },
  { key: "promotions.manage", group: "Store", label: "Manage promotions", description: "Create, pause and delete discount codes." },
  { key: "orders.view", group: "Orders", label: "View orders", description: "See orders with customer contact and delivery details." },
  { key: "orders.manage", group: "Orders", label: "Update orders", description: "Change order status (confirm, complete, cancel)." },
  { key: "payments.verify", group: "Orders", label: "Verify payments", description: "Mark M-Pesa payments verified and send payment prompts." },
  { key: "customers.view", group: "Customers", label: "View customers", description: "See registered customer accounts and contact details." },
  { key: "settings.manage", group: "Configuration", label: "Store settings", description: "Store identity, contact details, delivery fees and colours." },
  { key: "integrations.manage", group: "Configuration", label: "Integrations & security", description: "Meta, M-Pesa, email, SEO, consent and security settings, including secrets." },
  { key: "marketing.view", group: "Marketing", label: "View marketing", description: "Attribution, ad spend, ROAS, leads and tracking diagnostics." },
  { key: "team.view", group: "Team", label: "View team", description: "See admin accounts and the activity log." },
  { key: "team.manage", group: "Team", label: "Manage team", description: "Add, edit, disable and remove admins with a lower rank." },
  { key: "roles.manage", group: "Team", label: "Manage roles", description: "Create roles and change what each role can do." },
  { key: "audit.view", group: "Team", label: "View activity log", description: "See the record of admin changes." },
];

const PERMISSION_KEYS = PERMISSIONS.map((permission) => permission.key);

const DEFAULT_ROLES = [
  {
    key: "owner",
    name: "Owner",
    description: "Full control, including roles, security and every integration. Cannot be restricted.",
    rank: 100,
    isSystem: true,
    permissions: PERMISSION_KEYS,
  },
  {
    key: "admin",
    name: "Admin",
    description: "Runs the whole store and team, except editing role definitions.",
    rank: 80,
    isSystem: true,
    permissions: PERMISSION_KEYS.filter((key) => key !== "roles.manage"),
  },
  {
    key: "manager",
    name: "Manager",
    description: "Day-to-day operations: orders, payments, products, promotions and store settings.",
    rank: 60,
    isSystem: true,
    permissions: [
      "dashboard.view", "products.manage", "testimonials.manage", "promotions.manage", "orders.view",
      "orders.manage", "payments.verify", "customers.view", "settings.manage", "marketing.view",
    ],
  },
  {
    key: "editor",
    name: "Editor",
    description: "Catalogue and content only. No customer data or payments.",
    rank: 40,
    isSystem: true,
    permissions: ["dashboard.view", "products.manage", "testimonials.manage"],
  },
];

module.exports = { DEFAULT_ROLES, PERMISSIONS, PERMISSION_KEYS };

# Vibecraft Server

Express backend for the Vibecraft projector shop. Product, order, inquiry, and admin data are backed by PostgreSQL.

The server also serves the plain HTML/CSS/JavaScript client from `../Client`, so the whole app runs from one local URL.

Product and customer profile images are stored in Cloudinary. Set the three `CLOUDINARY_*` variables from `.env.example` before using image uploads.

## Getting started

```bash
npm install
cd ..
npm start
```

For local backend-only work, you can still run `npm run dev` inside `Server/`.

The app runs on `http://localhost:5000` by default. API routes are under `http://localhost:5000/api`.

## Database

The API services connect to PostgreSQL. By default the database name is `VibesCraft`.

Create `Server/.env` from `Server/.env.example` and set the Postgres credentials for your machine or hosted database.

Example local `.env`:

```bash
PGHOST=localhost
PGPORT=5432
PGDATABASE=VibesCraft
PGUSER=postgres
PGPASSWORD=your_postgres_password
PGSSL=false
```

Create the tables and seed the catalog:

```bash
npm run db:pg:init
```

`db:pg:reset` clears and reseeds the Postgres tables. If you reset the database, recreate the admin account afterward.

Tables created include:

- `categories`
- `products`
- `product_images`
- `product_specs`
- `product_box_items`
- `product_use_cases`
- `product_reviews`
- `customers`
- `orders`
- `order_items`
- `inquiry_answers`
- `order_recommendations`
- `admin_users`
- `admin_sessions`
- `customer_accounts`
- `customer_sessions`

The SQLite schema remains in `src/db/schema.sql` for local fallback/reference, but the active services use Postgres.

## Admin Login

Create or reset the admin account from the project root:

```bash
npm run admin:create -- --email owner@example.com --password "choose-a-strong-password" --name "Vibecraft Admin"
```

Then open `/login.html?next=admin-dashboard.html` and sign in with that email and password. Admin sessions use an HTTP-only cookie from the shared login flow.

Admin pages:

- `/admin-dashboard.html` - Dashboard and daily queue.
- `/admin.html` - Product catalog manager.
- `/admin-orders.html` - Orders and inquiry follow-up.

## Routes

- `GET /api/health` - API status.
- `GET /api/products` - List products, with optional `category`, `search`, `featured`, and `inStock` filters.
- `GET /api/products/:id` - Get one product.
- `GET /api/categories` - List categories.
- `POST /api/orders` - Create a customer order or inquiry.
- `POST /api/auth/signup` - Create a customer account.
- `POST /api/auth/login` - Shared customer/admin email/password sign in.
- `GET /api/auth/me` - Current signed-in customer.
- `POST /api/auth/me/avatar` - Upload the signed-in customer's profile image.
- `POST /api/auth/logout` - End the current customer/admin session.
- `POST /api/admin/auth/login` - Direct admin email/password sign in endpoint.
- `GET /api/admin/auth/me` - Current signed-in admin.
- `POST /api/admin/auth/logout` - End the current admin session.
- `GET /api/admin/products` - Admin product list.
- `POST /api/admin/products` - Create a product.
- `PATCH /api/admin/products/:id` - Update a product.
- `DELETE /api/admin/products/:id` - Delete a product.
- `POST /api/admin/uploads` - Upload product images for the signed-in admin.
- `GET /api/admin/orders` - Admin order list.
- `PATCH /api/admin/orders/:id/status` - Update order status.

## Next backend steps

- Add Google admin sign-in.
- Add payment or WhatsApp inquiry integration.

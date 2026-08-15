-- Synthetic medium-sized PostgreSQL dump for stability/volume testing.
-- Mirrors the MySQL fixture's domain (e-commerce) but deliberately exercises
-- what's actually different about PostgreSQL: double-quoted identifiers,
-- SERIAL/GENERATED ALWAYS AS IDENTITY, EXCLUDE constraints, schema-qualified
-- names, UNLOGGED tables, `LIKE ... INCLUDING ALL`, and typical pg_dump noise
-- (SET, ALTER TABLE ... OWNER TO, COMMENT ON, CREATE SEQUENCE ... OWNED BY)
-- interleaved between CREATE TABLE blocks.

SET statement_timeout = 0;
SET search_path = public, pg_catalog;

CREATE TABLE IF NOT EXISTS public.regions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE public.countries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    region_id INTEGER,
    FOREIGN KEY (region_id) REFERENCES public.regions(id)
);

CREATE TABLE public.states (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    country_id INTEGER REFERENCES public.countries(id)
);

CREATE TABLE public.cities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    state_id INTEGER,
    CONSTRAINT fk_city_state FOREIGN KEY (state_id) REFERENCES public.states(id)
);

-- customer-facing tables --

CREATE TABLE public.customers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(200) NOT NULL,
    city_id INTEGER,
    FOREIGN KEY (city_id) REFERENCES public.cities(id),
    UNIQUE (email)
);

CREATE TABLE public.customer_addresses (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER,
    line1 VARCHAR(255),
    line2 VARCHAR(255),
    city_id INTEGER,
    FOREIGN KEY (customer_id) REFERENCES public.customers(id),
    FOREIGN KEY (city_id) REFERENCES public.cities(id)
);

CREATE TABLE public.customer_phones (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES public.customers(id),
    phone_number VARCHAR(30) NOT NULL
);

CREATE INDEX idx_customers_city ON public.customers (city_id);

CREATE TABLE public.payment_methods (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER,
    type VARCHAR(50),
    token VARCHAR(255),
    FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);

-- catalog --

CREATE TABLE public.categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    parent_category_id INTEGER,
    FOREIGN KEY (parent_category_id) REFERENCES public.categories(id)
);

CREATE TABLE public.brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE public.products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    category_id INTEGER,
    brand_id INTEGER,
    FOREIGN KEY (category_id) REFERENCES public.categories(id),
    FOREIGN KEY (brand_id) REFERENCES public.brands(id),
    CHECK (price >= 0)
);

CREATE TABLE public.product_variants (
    id SERIAL PRIMARY KEY,
    product_id INTEGER,
    variant_name VARCHAR(100),
    extra_price NUMERIC(10,2) DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES public.products(id)
);

CREATE TABLE public.product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES public.products(id),
    url VARCHAR(500) NOT NULL
);

CREATE TABLE public.product_reviews (
    id SERIAL PRIMARY KEY,
    product_id INTEGER,
    customer_id INTEGER,
    rating INTEGER,
    "comment" TEXT,
    FOREIGN KEY (product_id) REFERENCES public.products(id),
    FOREIGN KEY (customer_id) REFERENCES public.customers(id),
    CHECK (rating BETWEEN 1 AND 5)
);

CREATE TABLE public.warehouses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    city_id INTEGER,
    FOREIGN KEY (city_id) REFERENCES public.cities(id)
);

CREATE TABLE public.inventory (
    id SERIAL PRIMARY KEY,
    product_id INTEGER,
    warehouse_id INTEGER,
    quantity INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES public.products(id),
    FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id)
);

CREATE INDEX idx_inventory_product ON public.inventory (product_id);

-- booking/reservation windows: EXCLUDE constraint is PostgreSQL-only and
-- must be discarded cleanly, not misread as a column.
CREATE TABLE public.warehouse_reservations (
    id SERIAL PRIMARY KEY,
    warehouse_id INTEGER REFERENCES public.warehouses(id),
    reserved_range TSRANGE NOT NULL,
    EXCLUDE USING gist (warehouse_id WITH =, reserved_range WITH &&)
);

-- orders --

CREATE TABLE public.order_statuses (
    id SERIAL PRIMARY KEY,
    label VARCHAR(50) NOT NULL
);

CREATE TABLE public.orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER,
    status_id INTEGER,
    address_id INTEGER,
    placed_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (customer_id) REFERENCES public.customers(id),
    FOREIGN KEY (status_id) REFERENCES public.order_statuses(id),
    FOREIGN KEY (address_id) REFERENCES public.customer_addresses(id)
);

CREATE TABLE public.order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER,
    product_id INTEGER,
    variant_id INTEGER,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES public.orders(id),
    FOREIGN KEY (product_id) REFERENCES public.products(id),
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id)
);

CREATE TABLE public.order_payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER,
    payment_method_id INTEGER,
    amount NUMERIC(10,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES public.orders(id),
    FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id)
);

CREATE TABLE public.shipments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES public.orders(id),
    carrier VARCHAR(100),
    tracking_code VARCHAR(100)
);

CREATE TABLE public.order_status_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER,
    status_id INTEGER,
    changed_at TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES public.orders(id),
    FOREIGN KEY (status_id) REFERENCES public.order_statuses(id)
);

CREATE TABLE public.returns (
    id SERIAL PRIMARY KEY,
    order_item_id INTEGER,
    reason TEXT,
    FOREIGN KEY (order_item_id) REFERENCES public.order_items(id)
);

-- coupons / promotions --

CREATE TABLE public.coupons (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    discount_percent INTEGER,
    UNIQUE (code)
);

CREATE TABLE public.order_coupons (
    id SERIAL PRIMARY KEY,
    order_id INTEGER,
    coupon_id INTEGER,
    FOREIGN KEY (order_id) REFERENCES public.orders(id),
    FOREIGN KEY (coupon_id) REFERENCES public.coupons(id)
);

-- cart: UNLOGGED table (ephemeral session data), exercises the modifier --

CREATE UNLOGGED TABLE public.carts (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES public.customers(id)
);

CREATE TABLE public.cart_items (
    id SERIAL PRIMARY KEY,
    cart_id INTEGER,
    product_id INTEGER,
    quantity INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (cart_id) REFERENCES public.carts(id),
    FOREIGN KEY (product_id) REFERENCES public.products(id)
);

-- support / tickets --

CREATE TABLE public.support_tickets (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER,
    subject VARCHAR(255),
    status VARCHAR(50),
    FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);

CREATE TABLE public.support_messages (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER,
    body TEXT,
    FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id)
);

-- suppliers --

CREATE TABLE public.suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    country_id INTEGER,
    FOREIGN KEY (country_id) REFERENCES public.countries(id)
);

CREATE TABLE public.product_suppliers (
    id SERIAL PRIMARY KEY,
    product_id INTEGER,
    supplier_id INTEGER,
    FOREIGN KEY (product_id) REFERENCES public.products(id),
    FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
);

CREATE TABLE public.purchase_orders (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER,
    warehouse_id INTEGER,
    ordered_at TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id),
    FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id)
);

CREATE TABLE public.purchase_order_items (
    id SERIAL PRIMARY KEY,
    purchase_order_id INTEGER,
    product_id INTEGER,
    quantity INTEGER NOT NULL,
    FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id),
    FOREIGN KEY (product_id) REFERENCES public.products(id)
);

-- employees / admin --

CREATE TABLE public.departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE public.employees (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(200) NOT NULL,
    department_id INTEGER,
    manager_id INTEGER,
    FOREIGN KEY (department_id) REFERENCES public.departments(id),
    FOREIGN KEY (manager_id) REFERENCES public.employees(id)
);

CREATE TABLE public.warehouse_staff (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER,
    warehouse_id INTEGER,
    FOREIGN KEY (employee_id) REFERENCES public.employees(id),
    FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id)
);

-- audit / misc, plus statements/noise that must be ignored --

CREATE SEQUENCE public.audit_log_id_seq;

CREATE TABLE public.audit_log (
    id INTEGER PRIMARY KEY DEFAULT nextval('public.audit_log_id_seq'::regclass),
    employee_id INTEGER,
    action VARCHAR(100),
    created_at TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;
ALTER TABLE public.audit_log OWNER TO admin;
COMMENT ON TABLE public.audit_log IS 'tracks employee actions';

CREATE TABLE public.settings (
    id SERIAL PRIMARY KEY,
    "key" VARCHAR(100) NOT NULL,
    value TEXT,
    UNIQUE ("key")
);

-- LIKE-clause table: has a body, so it IS modeled, but the LIKE clause
-- itself is discarded (no column copying) rather than becoming a bogus
-- "LIKE" column.
CREATE TABLE public.settings_backup (
    LIKE public.settings INCLUDING ALL
);

CREATE TABLE public.tags (
    id SERIAL PRIMARY KEY,
    label VARCHAR(50) NOT NULL
);

CREATE TABLE public.product_tags (
    id SERIAL PRIMARY KEY,
    product_id INTEGER,
    tag_id INTEGER,
    FOREIGN KEY (product_id) REFERENCES public.products(id),
    FOREIGN KEY (tag_id) REFERENCES public.tags(id)
);

CREATE TABLE public.wishlists (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES public.customers(id)
);

CREATE TABLE public.wishlist_items (
    id SERIAL PRIMARY KEY,
    wishlist_id INTEGER,
    product_id INTEGER,
    FOREIGN KEY (wishlist_id) REFERENCES public.wishlists(id),
    FOREIGN KEY (product_id) REFERENCES public.products(id)
);

CREATE TABLE public.newsletter_subscriptions (
    id SERIAL PRIMARY KEY,
    email VARCHAR(200) NOT NULL,
    UNIQUE (email)
);
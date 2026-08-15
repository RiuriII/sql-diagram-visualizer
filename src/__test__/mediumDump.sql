-- Synthetic medium-sized MySQL dump for stability/volume testing.
-- ~40 tables, mixing PK/FK styles, quoted identifiers, comments, and
-- typical mysqldump noise (SET, ALTER TABLE OWNER-equivalent, etc.)
-- deliberately interleaved to exercise Scanning's tolerance for irrelevant
-- statements between CREATE TABLE blocks.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `regions` (
  `id` INT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL
);

CREATE TABLE `countries` (
  `id` INT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `region_id` INT,
  FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`)
);

CREATE TABLE `states` (
  `id` INT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `country_id` INT REFERENCES `countries`(`id`)
);

CREATE TABLE `cities` (
  `id` INT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `state_id` INT,
  CONSTRAINT `fk_city_state` FOREIGN KEY (`state_id`) REFERENCES `states`(`id`)
);

-- customer-facing tables --

CREATE TABLE `customers` (
  `id` INT PRIMARY KEY,
  `full_name` VARCHAR(200) NOT NULL,
  `email` VARCHAR(200) NOT NULL,
  `city_id` INT,
  FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`),
  UNIQUE (`email`)
);

CREATE TABLE `customer_addresses` (
  `id` INT PRIMARY KEY,
  `customer_id` INT,
  `line1` VARCHAR(255),
  `line2` VARCHAR(255),
  `city_id` INT,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`),
  FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`)
);

CREATE TABLE `customer_phones` (
  `id` INT PRIMARY KEY,
  `customer_id` INT REFERENCES `customers`(`id`),
  `phone_number` VARCHAR(30) NOT NULL
);

CREATE INDEX idx_customers_city ON `customers` (`city_id`);

CREATE TABLE `payment_methods` (
  `id` INT PRIMARY KEY,
  `customer_id` INT,
  `type` VARCHAR(50),
  `token` VARCHAR(255),
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`)
);

-- catalog --

CREATE TABLE `categories` (
  `id` INT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `parent_category_id` INT,
  FOREIGN KEY (`parent_category_id`) REFERENCES `categories`(`id`)
);

CREATE TABLE `brands` (
  `id` INT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL
);

CREATE TABLE `products` (
  `id` INT PRIMARY KEY,
  `sku` VARCHAR(50) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `price` NUMERIC(10,2) NOT NULL DEFAULT 0,
  `category_id` INT,
  `brand_id` INT,
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`),
  FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`),
  CHECK (`price` >= 0)
);

CREATE TABLE `product_variants` (
  `id` INT PRIMARY KEY,
  `product_id` INT,
  `variant_name` VARCHAR(100),
  `extra_price` NUMERIC(10,2) DEFAULT 0,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`)
);

CREATE TABLE `product_images` (
  `id` INT PRIMARY KEY,
  `product_id` INT REFERENCES `products`(`id`),
  `url` VARCHAR(500) NOT NULL
);

CREATE TABLE `product_reviews` (
  `id` INT PRIMARY KEY,
  `product_id` INT,
  `customer_id` INT,
  `rating` INT,
  `comment` TEXT,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`),
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`),
  CHECK (`rating` BETWEEN 1 AND 5)
);

CREATE TABLE `warehouses` (
  `id` INT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `city_id` INT,
  FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`)
);

CREATE TABLE `inventory` (
  `id` INT PRIMARY KEY,
  `product_id` INT,
  `warehouse_id` INT,
  `quantity` INT NOT NULL DEFAULT 0,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`),
  FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`),
  INDEX idx_inventory_product (`product_id`)
);

-- orders --

CREATE TABLE `order_statuses` (
  `id` INT PRIMARY KEY,
  `label` VARCHAR(50) NOT NULL
);

CREATE TABLE `orders` (
  `id` INT PRIMARY KEY,
  `customer_id` INT,
  `status_id` INT,
  `address_id` INT,
  `placed_at` TIMESTAMP DEFAULT now(),
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`),
  FOREIGN KEY (`status_id`) REFERENCES `order_statuses`(`id`),
  FOREIGN KEY (`address_id`) REFERENCES `customer_addresses`(`id`)
);

CREATE TABLE `order_items` (
  `id` INT PRIMARY KEY,
  `order_id` INT,
  `product_id` INT,
  `variant_id` INT,
  `quantity` INT NOT NULL,
  `unit_price` NUMERIC(10,2) NOT NULL,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`),
  FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`)
);

CREATE TABLE `order_payments` (
  `id` INT PRIMARY KEY,
  `order_id` INT,
  `payment_method_id` INT,
  `amount` NUMERIC(10,2) NOT NULL,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`),
  FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods`(`id`)
);

CREATE TABLE `shipments` (
  `id` INT PRIMARY KEY,
  `order_id` INT REFERENCES `orders`(`id`),
  `carrier` VARCHAR(100),
  `tracking_code` VARCHAR(100)
);

CREATE TABLE `order_status_history` (
  `id` INT PRIMARY KEY,
  `order_id` INT,
  `status_id` INT,
  `changed_at` TIMESTAMP,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`),
  FOREIGN KEY (`status_id`) REFERENCES `order_statuses`(`id`)
);

CREATE TABLE `returns` (
  `id` INT PRIMARY KEY,
  `order_item_id` INT,
  `reason` TEXT,
  FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`)
);

-- coupons / promotions --

CREATE TABLE `coupons` (
  `id` INT PRIMARY KEY,
  `code` VARCHAR(50) NOT NULL,
  `discount_percent` INT,
  UNIQUE (`code`)
);

CREATE TABLE `order_coupons` (
  `id` INT PRIMARY KEY,
  `order_id` INT,
  `coupon_id` INT,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`),
  FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`)
);

-- cart --

CREATE TABLE `carts` (
  `id` INT PRIMARY KEY,
  `customer_id` INT REFERENCES `customers`(`id`)
);

CREATE TABLE `cart_items` (
  `id` INT PRIMARY KEY,
  `cart_id` INT,
  `product_id` INT,
  `quantity` INT NOT NULL DEFAULT 1,
  FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`)
);

-- support / tickets --

CREATE TABLE `support_tickets` (
  `id` INT PRIMARY KEY,
  `customer_id` INT,
  `subject` VARCHAR(255),
  `status` VARCHAR(50),
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`)
);

CREATE TABLE `support_messages` (
  `id` INT PRIMARY KEY,
  `ticket_id` INT,
  `body` TEXT,
  FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`)
);

-- suppliers --

CREATE TABLE `suppliers` (
  `id` INT PRIMARY KEY,
  `name` VARCHAR(200) NOT NULL,
  `country_id` INT,
  FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`)
);

CREATE TABLE `product_suppliers` (
  `id` INT PRIMARY KEY,
  `product_id` INT,
  `supplier_id` INT,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`),
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`)
);

CREATE TABLE `purchase_orders` (
  `id` INT PRIMARY KEY,
  `supplier_id` INT,
  `warehouse_id` INT,
  `ordered_at` TIMESTAMP,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`),
  FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`)
);

CREATE TABLE `purchase_order_items` (
  `id` INT PRIMARY KEY,
  `purchase_order_id` INT,
  `product_id` INT,
  `quantity` INT NOT NULL,
  FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`)
);

-- employees / admin --

CREATE TABLE `departments` (
  `id` INT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL
);

CREATE TABLE `employees` (
  `id` INT PRIMARY KEY,
  `full_name` VARCHAR(200) NOT NULL,
  `department_id` INT,
  `manager_id` INT,
  FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`),
  FOREIGN KEY (`manager_id`) REFERENCES `employees`(`id`)
);

CREATE TABLE `warehouse_staff` (
  `id` INT PRIMARY KEY,
  `employee_id` INT,
  `warehouse_id` INT,
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`),
  FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`)
);

-- audit / misc, plus statements that must be ignored --

CREATE SEQUENCE audit_log_id_seq;

CREATE TABLE `audit_log` (
  `id` INT PRIMARY KEY,
  `employee_id` INT,
  `action` VARCHAR(100),
  `created_at` TIMESTAMP,
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`)
);

ALTER TABLE `audit_log` OWNER TO admin;
COMMENT ON TABLE `audit_log` IS 'tracks employee actions';

CREATE TABLE `settings` (
  `id` INT PRIMARY KEY,
  `key` VARCHAR(100) NOT NULL,
  `value` TEXT,
  UNIQUE (`key`)
);

CREATE TABLE `settings_backup` LIKE `settings`;

CREATE TABLE `tags` (
  `id` INT PRIMARY KEY,
  `label` VARCHAR(50) NOT NULL
);

CREATE TABLE `product_tags` (
  `id` INT PRIMARY KEY,
  `product_id` INT,
  `tag_id` INT,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`),
  FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`)
);

CREATE TABLE `wishlists` (
  `id` INT PRIMARY KEY,
  `customer_id` INT REFERENCES `customers`(`id`)
);

CREATE TABLE `wishlist_items` (
  `id` INT PRIMARY KEY,
  `wishlist_id` INT,
  `product_id` INT,
  FOREIGN KEY (`wishlist_id`) REFERENCES `wishlists`(`id`),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`)
);

CREATE TABLE `newsletter_subscriptions` (
  `id` INT PRIMARY KEY,
  `email` VARCHAR(200) NOT NULL,
  UNIQUE (`email`)
);

SET FOREIGN_KEY_CHECKS = 1;

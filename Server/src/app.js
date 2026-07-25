const express = require("express");
const path = require("path");
const cors = require("cors");
const morgan = require("morgan");
const env = require("./config/env");
const healthRoutes = require("./routes/healthRoutes");
const productRoutes = require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const orderRoutes = require("./routes/orderRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const aiRoutes = require("./routes/aiRoutes");
const testimonialRoutes = require("./routes/testimonialRoutes");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const app = express();
const clientPath = path.join(__dirname, "../../Client");

app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

app.use("/api/health", healthRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/testimonials", testimonialRoutes);

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use(express.static(clientPath));

app.use(notFound);
app.use(errorHandler);

module.exports = app;

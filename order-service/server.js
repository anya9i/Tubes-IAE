const express = require("express");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// koneksi MongoDB (Docker friendly)
const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/orderdb";

mongoose.connect(MONGO_URL)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

/*
SCHEMA
*/
const orderSchema = new mongoose.Schema({
    menuId: String,
    quantity: Number,
    totalPrice: Number,
    status: {
        type: String,
        default: "pending"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Order = mongoose.model("Order", orderSchema);

/*
1. CREATE
*/
app.post("/orders", async (req, res) => {
    try {
        const { menuId, quantity } = req.body;

        if (!menuId || !quantity) {
            return res.status(400).json({ message: "menuId & quantity wajib" });
        }

        const order = new Order({
            menuId,
            quantity,
            totalPrice: quantity * 10000
        });

        const saved = await order.save();

        res.status(201).json(saved);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/*
2. GET ALL
*/
app.get("/orders", async (req, res) => {
    const data = await Order.find();
    res.json(data);
});

/*
3. GET BY ID
*/
app.get("/orders/:id", async (req, res) => {
    try {
        const data = await Order.findById(req.params.id);

        if (!data) {
            return res.status(404).json({ message: "Not found" });
        }

        res.json(data);
    } catch {
        res.status(400).json({ message: "Invalid ID" });
    }
});

/*
4. UPDATE
*/
app.put("/orders/:id", async (req, res) => {
    try {
        const { quantity, status } = req.body;

        let update = {};

        if (quantity) {
            update.quantity = quantity;
            update.totalPrice = quantity * 10000;
        }

        if (status) {
            update.status = status;
        }

        const data = await Order.findByIdAndUpdate(
            req.params.id,
            update,
            { new: true }
        );

        if (!data) {
            return res.status(404).json({ message: "Not found" });
        }

        res.json(data);

    } catch {
        res.status(400).json({ message: "Invalid ID" });
    }
});

/*
5. DELETE
*/
app.delete("/orders/:id", async (req, res) => {
    try {
        const data = await Order.findByIdAndDelete(req.params.id);

        if (!data) {
            return res.status(404).json({ message: "Not found" });
        }

        res.json({ message: "Deleted", data });

    } catch {
        res.status(400).json({ message: "Invalid ID" });
    }
});

app.get("/health", (req, res) => {
    res.json({ service: "order-service", status: "running" });
});

/*
RUN
*/
app.listen(PORT, () => {
    console.log(`Order Service running on port ${PORT}`);
});
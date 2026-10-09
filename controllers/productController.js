const Product = require("../models/Product");

// CREATE PRODUCT
const createProduct = async (req, res) => {
    try {
        const {
            name,
            description,
            category,
            price,
            sizes,
            image,
            images,
            featured
        } = req.body;

        const productImages = Array.isArray(images) && images.length ? images : (image ? [image] : []);
        const primaryImage = image || productImages[0];

        if (!name || !category || price === undefined || !primaryImage) {
            return res.status(400).json({
                message: "Name, category, price and image are required"
            });
        }

        const product = await Product.create({
            name,
            description,
            category,
            price,
            sizes,
            image: primaryImage,
            images: productImages,
            featured
        });

        res.status(201).json({
            message: "Product created successfully",
            product
        });

    } catch (error) {
        console.error("Create product error:", error);

        res.status(500).json({
            message: "Failed to create product"
        });
    }
};


// GET ALL PRODUCTS
const getProducts = async (req, res) => {
    try {
        const products = await Product.find({
            available: true
        }).sort({
            createdAt: -1
        });

        res.status(200).json({
            products
        });

    } catch (error) {
        console.error("Get products error:", error);

        res.status(500).json({
            message: "Failed to get products"
        });
    }
};


const getAdminProducts = async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.status(200).json({ products });
    } catch (error) {
        console.error("Get admin products error:", error);
        res.status(500).json({ message: "Failed to get products" });
    }
};

// GET ONE PRODUCT
const getProduct = async (req, res) => {
    try {
        const product = await Product.findOne({ _id: req.params.id, available: true });

        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.status(200).json({
            product
        });

    } catch (error) {
        console.error("Get product error:", error);

        res.status(500).json({
            message: "Failed to get product"
        });
    }
};


// UPDATE PRODUCT
const updateProduct = async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.status(200).json({
            message: "Product updated successfully",
            product
        });

    } catch (error) {
        console.error("Update product error:", error);

        res.status(500).json({
            message: "Failed to update product"
        });
    }
};


// DELETE / DEACTIVATE PRODUCT
const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            {
                available: false
            },
            {
                new: true
            }
        );

        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.status(200).json({
            message: "Product removed successfully",
            product
        });

    } catch (error) {
        console.error("Delete product error:", error);

        res.status(500).json({
            message: "Failed to remove product"
        });
    }
};


module.exports = {
    createProduct,
    getProducts,
    getAdminProducts,
    getProduct,
    updateProduct,
    deleteProduct
};
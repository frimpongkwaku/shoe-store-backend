const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        description: {
            type: String,
            trim: true
        },

        category: {
            type: String,
            required: true,
            trim: true
        },

        price: {
            type: Number,
            required: true,
            min: 0
        },

        sizes: [mongoose.Schema.Types.Mixed],

        image: {
            type: String,
            required: true,
            trim: true
        },

        images: [{
            type: String,
            trim: true
        }],

        colors: [{
            type: String,
            trim: true
        }],

        featured: {
            type: Boolean,
            default: false
        },

        available: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

const Product = mongoose.model("Product", productSchema);

module.exports = Product;



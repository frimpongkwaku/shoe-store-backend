const normalizeInventory = sizes => {
    if (!Array.isArray(sizes)) throw new Error("Product inventory is invalid.");

    const inventory = sizes.map(entry => {
        const [rawSize, rawStock] = typeof entry === "string"
            ? entry.split(/[,:]/).map(value => value.trim())
            : [entry?.size, entry?.stock];
        const size = String(rawSize ?? "").trim();
        const stock = Number(rawStock);
        if (!size || size.length > 40 || !Number.isInteger(stock) || stock < 0) {
            throw new Error("Product inventory contains an invalid size or stock count.");
        }
        return { size, stock };
    });

    const uniqueSizes = new Set(inventory.map(entry => entry.size.toLowerCase()));
    if (uniqueSizes.size !== inventory.length) throw new Error("Product inventory contains duplicate sizes.");
    return inventory;
};

const buildVerifiedOrderItems = (requestedItems, products) => {
    const productsById = new Map(products.map(product => [String(product._id), product]));

    return requestedItems.map(item => {
        const product = productsById.get(String(item.productId));
        if (!product || product.available === false) {
            const error = new Error("A product in your cart is no longer available. Refresh the store and try again.");
            error.status = 409;
            throw error;
        }

        const expectedPrice = Number(item.expectedPrice);
        const currentPrice = Number(product.price);
        if (!Number.isFinite(expectedPrice) || expectedPrice !== currentPrice) {
            const error = new Error(`The price of ${product.name} has changed. Review the current price and try again.`);
            error.status = 409;
            error.code = "PRICE_CHANGED";
            error.productId = String(product._id);
            error.productName = product.name;
            error.currentPrice = currentPrice;
            throw error;
        }

        const qty = Number(item.qty);
        if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
            const error = new Error("Order quantities must be whole numbers between 1 and 100.");
            error.status = 400;
            throw error;
        }

        const requestedSize = String(item.size ?? "").trim();
        const inventory = normalizeInventory(product.sizes);
        const inventoryEntry = inventory.find(entry => entry.size.toLowerCase() === requestedSize.toLowerCase());
        if (!inventoryEntry) {
            const error = new Error(`${product.name} is not available in size ${requestedSize || "selected"}. Refresh the store and try again.`);
            error.status = 409;
            throw error;
        }

        if (inventoryEntry.stock < qty) {
            const error = new Error(`Only ${inventoryEntry.stock} unit(s) of ${product.name} in size ${inventoryEntry.size} remain.`);
            error.status = 409;
            throw error;
        }

        const availableColors = Array.isArray(product.colors) ? product.colors.map(color => String(color).trim()).filter(Boolean) : [];
        const requestedColor = String(item.color ?? "").trim();
        let color = "Default";
        if (availableColors.length) {
            color = availableColors.find(option => option.toLowerCase() === requestedColor.toLowerCase());
            if (!color) {
                const error = new Error(`The selected color for ${product.name} is no longer available.`);
                error.status = 409;
                throw error;
            }
        }

        return {
            productId: String(product._id),
            name: product.name,
            price: Number(product.price),
            qty,
            size: inventoryEntry.size,
            color
        };
    });
};

module.exports = { normalizeInventory, buildVerifiedOrderItems };
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
        },
        price: {
          type: Number,
          required: true,
        },
        discount: {
          type: Number,
          default: 0,
        },
        discountedPrice: {
          type: Number,
          required: true,
        },
        jenis: {
          type: String,
          required: true,
        },
        size: {
          type: String,
          required: true,
        },
        color: {
          type: String,
        },
        satuan: {
          type: String,
          required: true,
          enum: ["kg", "ekor"],
          default: "kg",
        },
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
    },
    shippingAddress: {
      recipientName: { type: String, required: true },
      phoneNumber: { type: String, required: true },
      streetAddress: { type: String, required: true },
      city: { type: String, required: true },
      province: { type: String, required: true },
      postalCode: { type: String, required: true },
    },
    shippingCost: {
      type: Number,
      default: 0,
    },
    paymentMethod: {
      type: String,
      required: true,
    },
    proofOfPayment: {
      type: String,
    },
    status: {
      type: String,
      enum: [
        "Pending",
        "Paid",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
      ],
      default: "Pending",
    },
    trackingNumber: {
      type: String,
    },
    shippingMethod: {
      type: String,
      enum: ["courier", "COD"],
    },
    codProof: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);

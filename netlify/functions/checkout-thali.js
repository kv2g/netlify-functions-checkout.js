const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// TODO: update to the real published URL for THIS thali order page once your
// domain is live — e.g. https://www.sapnasgujratikitchen.co.uk/order-thali
const THALI_PAGE_URL = 'https://www.sapnasgujratikitchen.co.uk/order-thali';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function trim(str, max = 490) {
  if (!str) return '';
  return String(str).slice(0, max);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { vegQty, meatQty, deliveryMethod, customerName, customerPhone, customerAddress } = body;

  const veg = Number(vegQty) || 0;
  const meat = Number(meatQty) || 0;

  if (veg < 0 || meat < 0 || (veg + meat) === 0) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No thalis selected' }) };
  }

  if (!customerName || !customerPhone) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Name and phone are required' }) };
  }

  if (deliveryMethod === 'delivery' && (!customerAddress || !customerAddress.trim())) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Address required for delivery' }) };
  }

  const VEG_PRICE = 1599;   // pence
  const MEAT_PRICE = 1899;  // pence
  const DELIVERY_FEE = 299; // pence

  const line_items = [];
  if (veg > 0) {
    line_items.push({
      price_data: {
        currency: 'gbp',
        product_data: { name: 'Vegetarian Thali' },
        unit_amount: VEG_PRICE,
      },
      quantity: veg,
    });
  }
  if (meat > 0) {
    line_items.push({
      price_data: {
        currency: 'gbp',
        product_data: { name: 'Meat Thali' },
        unit_amount: MEAT_PRICE,
      },
      quantity: meat,
    });
  }
  if (deliveryMethod === 'delivery') {
    line_items.push({
      price_data: {
        currency: 'gbp',
        product_data: { name: 'Delivery Fee' },
        unit_amount: DELIVERY_FEE,
      },
      quantity: 1,
    });
  }

  try {
    const successParams = new URLSearchParams({
      status: 'success',
      name: customerName,
      method: deliveryMethod
    }).toString();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: `${THALI_PAGE_URL}?${successParams}`,
      cancel_url: `${THALI_PAGE_URL}?status=cancel`,
      metadata: {
        orderType: 'thali',
        customerName: trim(customerName),
        customerPhone: trim(customerPhone),
        customerAddress: trim(customerAddress),
        deliveryMethod: trim(deliveryMethod),
        vegQty: String(veg),
        meatQty: String(meat)
      }
    });

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ url: session.url }) };
  } catch (error) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
  }
};

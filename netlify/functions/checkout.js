const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// TODO: change this to your real published site URL (the one customers actually browse to,
// not the googleusercontent.com iframe origin — that won't work as a redirect target)
const SITE_URL = 'https://www.sapnasgujratikitchen.co.uk';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async (event) => {
  // Browsers send an OPTIONS preflight before the real POST — must answer it directly
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

  const { tiffinType, selectedDays, deliveryMethod, customerEmail } = body;

  const pricingConfig = {
    veg: { standard: 999, package: 899, hasPackage: true },
    meat: { standard: 1199, package: 1099, hasPackage: true },
    family: { standard: 2199, package: 2199, hasPackage: false }
  };

  const config = pricingConfig[tiffinType];
  if (!config) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid plan' }) };
  }

  const days = Number(selectedDays);
  if (!Number.isInteger(days) || days < 3 || days > 7) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid number of days' }) };
  }

  const isPackageEligible = config.hasPackage && days >= 4;
  const activePrice = isPackageEligible ? config.package : config.standard;

  const mealTotal = days * activePrice;
  const deliveryTotal = deliveryMethod === 'delivery' ? (days * 299) : 0;
  const grandTotalInPence = mealTotal + deliveryTotal;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: customerEmail,
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: `${tiffinType.toUpperCase()} Tiffin (${days} days)`,
            description: deliveryMethod === 'delivery' ? 'Includes Delivery' : 'Collection Only',
          },
          unit_amount: grandTotalInPence,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${SITE_URL}/?status=success`,
      cancel_url: `${SITE_URL}/?status=cancel`,
    });

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ url: session.url }) };
  } catch (error) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
  }
};

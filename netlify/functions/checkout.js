const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// TODO: change this to your real published site URL
const SITE_URL = 'https://www.sapnasgujratikitchen.co.uk';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// Stripe metadata values are capped at 500 chars — trim anything a customer
// might paste in that's unreasonably long, so the session creation never fails
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

  const {
    tiffinType,
    selectedDays,
    dayNames,
    deliveryMethod,
    customerEmail,
    customerName,
    customerAddress,
    notes
  } = body;

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

  if (deliveryMethod === 'delivery' && (!customerAddress || !customerAddress.trim())) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Address required for delivery' }) };
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
      metadata: {
        orderType: 'tiffin',
        customerName: trim(customerName),
        customerEmail: trim(customerEmail),
        customerAddress: trim(customerAddress),
        tiffinType: trim(tiffinType),
        daysCount: String(days),
        dayNames: trim(dayNames),
        deliveryMethod: trim(deliveryMethod),
        notes: trim(notes)
      }
    });

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ url: session.url }) };
  } catch (error) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
  }
};

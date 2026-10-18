const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// TODO: change this to your real published site URL
const SITE_URL = 'https://www.sapnasgujratikitchen.co.uk/home';

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
    isTaster,
    customerEmail,
    customerName,
    customerAddress,
    notes
  } = body;

  const pricingConfig = {
    veg: { light: 1299, standard: 999, package: 899, hasPackage: true },
    meat: { light: 1299, standard: 1199, package: 1099, hasPackage: true },
    family: { light: 2199, standard: 2199, package: 2199, hasPackage: false }
  };

  const config = pricingConfig[tiffinType];
  if (!config) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid plan' }) };
  }

  const days = Number(selectedDays);
  // FIX: Allow 1 day minimum instead of 3
  if (!Number.isInteger(days) || days < 1 || days > 7) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid number of days' }) };
  }

  if (deliveryMethod === 'delivery' && (!customerAddress || !customerAddress.trim())) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Address required for delivery' }) };
  }

  // Check if taster pricing applies
  const isTasterEligible = (days === 1 && (tiffinType === 'veg' || tiffinType === 'meat'));
  const isTasterApplied = isTasterEligible && isTaster === true;

  let activePrice;
  if (isTasterApplied) {
    activePrice = 699; // £6.99 in pence
  } else if (days <= 2) {
    activePrice = config.light;
  } else if (config.hasPackage && days >= 4) {
    activePrice = config.package;
  } else {
    activePrice = config.standard;
  }

  const mealTotal = days * activePrice;
  const deliveryTotal = deliveryMethod === 'delivery' ? (days * 299) : 0;
  const grandTotalInPence = mealTotal + deliveryTotal;

  let planName = `${tiffinType.toUpperCase()} Tiffin (${days} days)`;
  if (isTasterApplied) {
    planName = `${tiffinType.toUpperCase()} Tiffin - Taster/Sample (1 day)`;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: customerEmail,
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: planName,
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
        isTaster: isTasterApplied ? 'Yes' : 'No',
        notes: trim(notes)
      }
    });

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ url: session.url }) };
  } catch (error) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
  }
};

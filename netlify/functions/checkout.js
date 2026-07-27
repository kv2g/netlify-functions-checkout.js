const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  
  const { tiffinType, selectedDays, deliveryMethod, customerEmail } = JSON.parse(event.body);

  const pricingConfig = {
    veg: { standard: 999, package: 899, hasPackage: true },
    meat: { standard: 1199, package: 1099, hasPackage: true },
    family: { standard: 2199, package: 2199, hasPackage: false }
  };

  const config = pricingConfig[tiffinType];
  if (!config) return { statusCode: 400, body: 'Invalid plan' };

  const isPackageEligible = config.hasPackage && selectedDays >= 4;
  const activePrice = isPackageEligible ? config.package : config.standard;
  
  const mealTotal = selectedDays * activePrice;
  const deliveryTotal = deliveryMethod === 'delivery' ? (selectedDays * 299) : 0;
  const grandTotalInPence = mealTotal + deliveryTotal;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: customerEmail,
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: `${tiffinType.toUpperCase()} Tiffin (${selectedDays} days)`,
            description: deliveryMethod === 'delivery' ? 'Includes Delivery' : 'Collection Only',
          },
          unit_amount: grandTotalInPence,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${event.headers.origin}/?status=success`,
      cancel_url: `${event.headers.origin}/?status=cancel`,
    });

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

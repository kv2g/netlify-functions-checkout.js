const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  // Handle CORS (so your Netlify function can safely talk to your Google Sites frontend)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    
    // Calculate totals securely on the backend (in pence for Stripe)
    const vegTotal = data.vegQty * 1599; 
    const meatTotal = data.meatQty * 1899; 
    const deliveryFee = (data.deliveryMethod === 'delivery' && (data.vegQty + data.meatQty) > 0) ? 299 : 0;
    const totalAmount = vegTotal + meatTotal + deliveryFee;

    if (totalAmount === 0) {
      throw new Error("Order total cannot be zero.");
    }

    // CREATE A PAYMENT INTENT (This is the crucial change for headless processing)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'gbp',
      metadata: {
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        delivery_method: data.deliveryMethod,
        customer_address: data.customerAddress || 'N/A'
      }
    });

    // Return the specific "client secret" that the HTML file needs
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
};

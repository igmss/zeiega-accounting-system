// Test webhook with production URL
async function testProductionWebhook() {
  try {
    console.log("🧪 Testing production webhook...")
    
    const response = await fetch('https://teluasegh-accounting-system.vercel.app/api/webhooks/order-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderId: "3BzExHXnvYpEu0jOaFDP",
        status: "processing",
        webhookSecret: "test-secret-123"
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    console.log('✅ Production webhook test successful!')
    console.log('📋 Response:', result)
    
    return result
  } catch (error) {
    console.error('❌ Production webhook test failed:', error)
    throw error
  }
}

// Run the test
testProductionWebhook()
  .then(result => {
    console.log('🎉 Production webhook is working!')
    console.log('✅ Your accounting system is ready for integration')
  })
  .catch(error => {
    console.error('💥 Production webhook test failed:', error)
  })

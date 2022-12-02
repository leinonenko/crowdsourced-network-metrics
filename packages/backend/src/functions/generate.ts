import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { z } from 'zod'
import { MEASUREMENT_COLLECTION, QUERY_COLLECTION, REGION } from '../utils/constants'
import { cors } from '../utils/cors'
import { generateMockData } from '../utils/random'


// Generate a mock query with the provided number of measurements
export const generate = functions.region(REGION).https.onRequest(async (request, response) => {
  try {
    // Handle CORS
    const isPreflight = cors(request, response)
    if (isPreflight) return

    // Allow only GET requests to pass further
    if (request.method !== 'GET') {
      response.status(405).header('Allow', 'GET').json({ success: false })
      return
    }

    // Validate the request query
    const schema = z.object({
      count: z.string().default('10').transform(Number).refine(val => Number.isSafeInteger(val) && val <= 500, {
        message: 'Count is not a valid integer below 500.'
      })
    }).strict()
    const result = schema.safeParse(request.query)
    if (!result.success) {
      response.status(400).json({ success: false, errors: result.error.errors })
      return
    }

    // Generate mock query and measurements
    const [ query, measurements ] = generateMockData(result.data.count)

    // Save the query to the database
    await admin.firestore().collection(QUERY_COLLECTION).doc(query.id).set(query)

    // Save the measurements to the database, using a batch write for performance reasons
    const collection = admin.firestore().collection(MEASUREMENT_COLLECTION)
    const batchWrite = admin.firestore().batch()
    measurements.forEach(measurement => batchWrite.set(collection.doc(measurement.id), measurement))
    await batchWrite.commit()

    // Respond with success true
    response.status(200).json({ success: true })
  } catch (error) {
    functions.logger.error(error)
    response.status(500).json({ success: false })
  }
})

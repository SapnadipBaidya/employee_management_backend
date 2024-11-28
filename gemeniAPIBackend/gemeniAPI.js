const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
const cors = require('cors'); // Import CORS
const redis = require('redis'); // Import Redis
const winston = require('winston');
const app = express();

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console() // Log to stdout
  ],
});

const PORT = 3000;

// Enable CORS
app.use(cors());

// Redis client setup
const env = process.env.ENV || "local"; // Default to local if ENV is not set
const redisHost = env === "docker" ? "redis" : "localhost";
const redisClient = redis.createClient({
    url: `redis://${redisHost}:6379`
});
redisClient.on('error', (err) =>
    logger.info('Redis Client Error', err));

// Connect to Redis
redisClient.connect();

// Middleware to parse JSON requests
app.use(express.json());

async function getGemeniResponse(question) {
    try {
        const APIKEY = "AIzaSyArBPZDR1_IbNgduLEqKtXsFIQ1FnGoM6c";
        const genAI = new GoogleGenerativeAI(APIKEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = question?.toString();
        const result = await model.generateContent(prompt);

        // Extract the response text
        const responseText = result.response.text();
        console.log(responseText);

        return responseText;
    } catch (error) {
        logger.error('Error generating response:', error);
        return "An Unexpected Error Occurred";
    }
}

// Define a route
app.post('/', async (req, res) => {
    const question = req.body.ques?.toString();

    if (!question) {
        return res.status(400).send("Invalid request: Missing 'ques' field.");
    }

    try {
        // Check Redis cache for an existing response
        console.log("question ", question);
        const cachedResponse = await redisClient.get(question);
        console.log("cachedResponse ", cachedResponse);
        if (cachedResponse) {
            logger.info('Cache hit');
            return res.send(cachedResponse); // Return cached response
        }

        // If not in cache, generate response
        logger.info('Cache miss');
        const response = await getGemeniResponse(question);

        // Store the response in Redis (expire after 1 hour)
        await redisClient.setEx(question, 60 * 60, response);

        res.send(response);
    } catch (error) {
        logger.error('Error handling request:', error);
        res.status(500).send("An Unexpected Error Occurred");
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
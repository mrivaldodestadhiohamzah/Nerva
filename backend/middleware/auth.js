import jwt from 'jsonwebtoken';
import "../utils/env.js";
import { getJwtSecret } from '../utils/helpers.js';


export const authenticateToken = (req, res, next) => {
    const jwtSecret = getJwtSecret();

    if (!jwtSecret) {
        console.error("Missing JWT_SECRET environment variable");
        return res.status(500).json({ error: "Server authentication is not configured" });
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        console.log("No token provided");
        return res.sendStatus(401);
    }

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            console.error("Token verification failed:", err.message);
            return res.sendStatus(403);
        }

        console.log("Token verified successfully");
        req.user = user;
        next();
    });
};
    

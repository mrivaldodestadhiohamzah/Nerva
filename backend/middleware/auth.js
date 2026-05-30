import jwt from 'jsonwebtoken';
import "../utils/env.js";
import { getJwtSecret } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';


export const authenticateToken = (req, res, next) => {
    const jwtSecret = getJwtSecret();

    if (!jwtSecret) {
        logger.error("Missing JWT_SECRET environment variable");
        return res.status(500).json({ error: "Server authentication is not configured" });
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({
            success: false,
            message: "Tidak memiliki akses"
        });
    }

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            logger.warn("Token verification failed", { message: err.message });
            return res.status(403).json({
                success: false,
                message: "Tidak memiliki akses"
            });
        }

        req.user = user;
        next();
    });
};
    

import { Request, Response } from 'express';
import { loginUser } from './service';

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    
    const result = await loginUser(username, password);
    
    res.status(200).json(result);
  } catch (error: any) {
    req.log.warn(`Login failed for username: ${req.body?.username} - ${error.message}`);
    res.status(401).json({ message: 'Invalid username or password' });
  }
};

import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as CryptoJS from 'crypto-js';
import { ENV } from 'src/config/environment';
import { JWTPayload } from 'src/dto/common-request.dto';

export class HashUtil {
  static hashBcrypt = async (text = '', salt = 10): Promise<string> => {
    const saltHash = await bcrypt.genSalt(salt);
    return await bcrypt.hash(text, saltHash);
  };

  static compareBcrypt = async (plaintext: string, hash: string): Promise<boolean> => {
    if (!plaintext || !hash) return false;
    return await bcrypt.compare(plaintext, hash);
  };

  static hashPassword = async (password: string): Promise<string> => {
    return await HashUtil.hashBcrypt(password, 10);
  };

  static comparePassword = async (plaintext: string, hash: string): Promise<boolean> => {
    return await HashUtil.compareBcrypt(plaintext, hash);
  };

  static signAccessToken = async (sub: number, username: string, jwtService: JwtService) => {
    const payload: JWTPayload = { sub, username };

    const token = await jwtService.signAsync(payload, {
      secret: ENV.JWT.JWT_SECRET,
      expiresIn: ENV.JWT.JWT_EXPIRE_IN,
    });

    return {
      payload,
      token,
      expiresIn: ENV.JWT.JWT_EXPIRE_IN,
    };
  };

  static aesEncrypt = (plainText: string, secretKey = ENV.API_KEY): string => {
    return CryptoJS.AES.encrypt(plainText, secretKey).toString();
  };

  static aesDecrypt = (encrypted: string, secretKey = ENV.API_KEY): string => {
    const bytes = CryptoJS.AES.decrypt(encrypted, secretKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  };
}

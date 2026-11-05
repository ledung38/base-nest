/* eslint-disable @typescript-eslint/no-var-requires */
const { unlink } = require('fs');

export class StorageUtil {
  static getDbBackupPath = (filename: string) => `db-backup/${filename}`;

  static deleteFile = async (path: string) => {
    await new Promise((resolve, reject) => {
      unlink(path, (err) => {
        reject({ error: err });
        return;
      });
      resolve(undefined);
    });
  };
}

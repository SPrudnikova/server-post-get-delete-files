'use strict';

const url = require('url');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

const PUBLIC_FOLDER = __dirname + '/public';
const FILES_FOLDER = __dirname + '/files';

function notFoundError (res) {
  res.statusCode = 404;
  res.end("File not found");
}

function serverError (res) {
  res.statusCode = 500;
  res.end("Server Error");
}

function badRequestError (res) {
  res.statusCode = 400;
  res.end("Bad Request");
}

function getFullPath (decodedPath, folder, res) {
  if (~decodedPath.indexOf('\0')) {
    badRequestError(res);
    return;
  }
  return path.normalize(path.join(folder, decodedPath));
}

function sendFile (filePath, encoding, res, mimeType) {
  const file = new fs.ReadStream(filePath, { encoding: encoding });
  file
    .on('error', function (error) {
      if (error.code = 'ENOENT') {
        notFoundError(res);
        return;
      }
      serverError(res);
    })
    .on('open', function () {
      res.setHeader('Content-Type', mimeType);
    })
    .pipe(res)
    .on('close', function () {
      file.destroy();
    })
}

function saveFile (req, res, decodedPath) {
  const newFilePath = getFullPath(decodedPath, FILES_FOLDER, res);
  const writeStream = new fs.WriteStream(newFilePath, { flags: 'wx' });
  let bodyLength = 0;

  writeStream
    .on('error', function (error) {
      if (error.code === 'EEXIST') {
        res.statusCode = 409;
        res.end("File already exists");
      } else {
        console.log(error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Connection': 'close' });
          res.write('Internal error');
        }
        fs.unlink(newFilePath, function (err) {
          if (err) {
            serverError(res);
          }
        });
      }
    })
    .on('close', function () {
      res.statusCode = 200;
      res.end("Ok");
    });

  req
    .on('data', function (data) {
      bodyLength = bodyLength + data.length;
      if (bodyLength > 1e6) {
        res.statusCode = 413;
        res.setHeader('Connection', 'close');
        res.end("File is too big");
        writeStream.destroy();
        fs.unlink(newFilePath, function (err) {
          if (err) {
            serverError(res);
          }
        });
      }
    })
    .on('close', function () {
      fs.unlink(newFilePath, function (err) {
        if (err) {
          serverError(res);
        }
      });
      writeStream.destroy();
    })
    .pipe(writeStream);
}


module.exports = require('http').createServer(function (req, res) {

  let decodedPath;

  try {
    decodedPath = decodeURI(url.parse(req.url).pathname);
  } catch (err) {
    badRequestError(res);
    return;
  }

  let filename = decodedPath.slice(1);

  if (filename.includes('/') || filename.includes('..')) {
    res.statusCode = 400;
    res.end('Nested paths are not allowed');
    return;
  }

  switch (req.method) {
    case 'GET':
      if (decodedPath === '/') {
        const filePath = PUBLIC_FOLDER + '/index.html';
        sendFile(filePath, 'utf-8', res, 'text/html');
        return;
      }
      const mimeType = mime.lookup(decodedPath);
      const fullPathGet = getFullPath(decodedPath, FILES_FOLDER, res);
      sendFile(fullPathGet, 'utf-8', res, mimeType);
      break;

    case 'DELETE':
      const fullPathDelete = getFullPath(decodedPath, FILES_FOLDER, res);
      fs.unlink(fullPathDelete, function (err) {
        if (err) {
          if (err.code = 'ENOENT') {
            notFoundError(res);
            return;
          }
          serverError(res);
          return;
        }
        res.statusCode = 200;
        res.end("Ok");
      });
      break;

    case 'POST':
      if (req.headers['content-length'] > 1e6) {
        res.statusCode = 413;
        res.end("File is too big");
        return;
      }
      saveFile(req, res, decodedPath);
      break;

    default:
      res.statusCode = 502;
      res.end("Not implemented");
  }
});

const assert = require('assert');
const request = require('request');
const fse = require('fs-extra');
const config = require('config');
const Readable = require('stream').Readable;
const requestPromise = require('request-promise').defaults({
  encoding: null,
  simple: false, // делает запросы со статусам 400-499 валидными, без этого флага нужно оборачивать requestPromise в try catch
  resolveWithFullResponse: true
});

const server = require('../server.js');
const fixturesRoot = __dirname + '/fixtures';
const host = 'http://localhost:3000';
const filesRoot = config.get('filesRoot');

describe('Server', () => {
  let app;

  before(done => {
    app = server.listen(3000, done);
  });

  after(done => {
    app.close(done);
  });

  beforeEach(() => {
    fse.emptyDirSync(filesRoot);
  });

  it('Should return index html', async () => {
    const response = await requestPromise(host);
    const file = fse.readFileSync(`public/index.html`, {encoding: 'utf-8'});
    assert.equal(response.body, file);
  });

  describe('GET /file.ext', () => {

    context("File exists", () => {
      beforeEach(() => {
        fse.copySync(`${fixturesRoot}/README.md`, `${filesRoot}/README.md`);
      });

      it('Should return file', async () => {
        const response = await requestPromise(`${host}/README.md`);
        const file = fse.readFileSync(`${fixturesRoot}/README.md`, {encoding: 'utf-8'});
        assert.equal(response.body, file);
      });

    });

    context("File does not exist", () => {

      it('Should return 404', done => {
        request(`${host}/README.md`, function(error, response, body) {
          if (error) return done(error);

          assert.equal(response.statusCode, 404);
          done();
        });
      });

    });

    context("Wrong path", () => {

      it('Should return 404', done => {
        request(`${host}/some/path.js`, function(error, response, body) {
          if (error) return done(error);

          assert.equal(response.statusCode, 400);
          done();
        });
      });

    });

  });

  describe('DELETE /file.ext', () => {

    context("File exists", () => {
      beforeEach(() => {
        fse.copySync(`${fixturesRoot}/README.md`, `${filesRoot}/README.md`);
      });

      it('Should delete existing file', done => {
        request.delete(`${host}/README.md`, function (error, response, body) {
          if (error) return done(error);

          assert.equal(response.statusCode, 200);
          done();
        });

      });

    });

    context("File does not exist", () => {

      it('Should return 404', done => {

        request.delete(`${host}/noSuchFile`, function(error, response, body) {
          if (error) return done(error);

          assert.equal(response.statusCode, 404);
          done();
        });

      });

    });

  });

  describe('POST /file.ext', () => {

    context("File exists", () => {
      beforeEach(() => {
        fse.copySync(`${fixturesRoot}/README.md`, `${filesRoot}/README.md`);
      });

      it('Small file: 409 & same modified time', done => {
        const mtime = fse.statSync(`${filesRoot}/README.md`).mtime;

        const req = request.post(`${host}/README.md`, function (error, response, body) {
          if (error) return done(error);

          const newMtime = fse.statSync(`${filesRoot}/README.md`).mtime;
          assert.deepEqual(newMtime, mtime);
          assert.equal(response.statusCode, 409);
          done();
        });

        fse.createReadStream(`${fixturesRoot}/README.md`).pipe(req);
      });

      it('Zero size: 409 & same modified time', done => {
        const req = request.post(`${host}/README.md`, function (error, response, body) {
          if (error) return done(error);

          assert.equal(response.statusCode, 409);
          done();
        });

        const zeroReadable = new Readable();
        zeroReadable.push(null);
        zeroReadable.pipe(req);
      });

    });

    context("File does not exist", () => {

      it('Too big file: return 413', done => {
        const req = request.post(`${host}/tooBig.jpg`, function (error, response, body) {
          if (error) {
            // see this for description https://github.com/nodejs/node/issues/947#issue-58838888
            // there is a problem in nodejs with it
            if (error.code === 'ECONNRESET' || error.code === 'EPIPE') {
              assert.ok(!fse.existsSync(`${filesRoot}/tooBig.jpg`));
              return done();
            } else {
              return done(error);
            }
          }

          assert.equal(response.statusCode, 413);
          done();
        });

        fse.createReadStream(`${fixturesRoot}/tooBig.jpg`).pipe(req);
      });

      it('Zero size: 200 & file uploaded', done => {
        const req = request.post(`${host}/zero.jpg`, function (error, response, body) {
          if (error) return done(error);

          assert.ok(fse.existsSync(`${filesRoot}/zero.jpg`));
          assert.equal(response.statusCode, 200);
          done();
        });

        const zeroReadable = new Readable();
        zeroReadable.push(null);
        zeroReadable.pipe(req);
      });

      it('Normal size: 200 & file uploaded', done => {
        const req = request.post(`${host}/README.md`, function (error, response, body) {
          if (error) return done(error);

          assert.ok(fse.existsSync(`${filesRoot}/README.md`));
          assert.equal(response.statusCode, 200);
          done();
        });

        fse.createReadStream(`${fixturesRoot}/README.md`).pipe(req);
      });

    });

  });

});
const path = require('path');
const Module = require(path.join(__dirname, '..', '..', 'core', 'module.js'));
const validation = new(require(path.join(__dirname, '..', '..', 'core', 'validation.js')))();
const Router = require('co-router');
const ObjectID = require('mongodb').ObjectID;
const pagesFields = require(path.join(__dirname, 'schemas', 'pagesFields.js'));
const crypto = require('crypto');
const config = require(path.join(__dirname, '..', '..', 'etc', 'config.js'));

module.exports = function(app) {
    const log = app.get('log');
    const db = app.get('db');

    const sortFields = ['name', 'folder', 'title', 'status'];

    const list = async(req, res) => {
        res.contentType('application/json');
        if (!Module.isAuthorizedAdmin(req)) {
            return res.send(JSON.stringify({
                status: 0
            }));
        }
        const sortField = req.query.sortField || 'pagename';
        const sortDirection = (req.query.sortDirection === 'asc') ? 1 : -1;
        const sort = {};
        sort[sortField] = sortDirection;
        let skip = req.query.skip || 0;
        let limit = req.query.limit || 10;
        let search = req.query.search || '';
        if (typeof sortField !== 'string' || typeof skip !== 'string' || typeof limit !== 'string' || typeof search !== 'string') {
            return res.send(JSON.stringify({
                status: 0
            }));
        }
        skip = parseInt(skip, 10) || 0;
        limit = parseInt(limit, 10) || 0;
        search = search.trim();
        if (search.length < 3) {
            search = undefined;
        }
        let result = {
            status: 0
        };
        if (sortFields.indexOf(sortField) === -1) {
            result.failedField = 'sortField';
            return res.send(result);
        }
        let fquery = {};
        try {
            if (search) {
                fquery = {
                    $or: [
                        { pagename: { $regex: search, $options: 'i' } },
                        { email: { $regex: search, $options: 'i' } }
                    ]
                };
            }
            const total = await db.collection('pages').find(fquery, { skip: skip, limit: limit }).count();
            const items = await db.collection('pages').find(fquery, { skip: skip, limit: limit }).sort(sort).toArray();
            let data = {
                status: 1,
                count: items.length,
                total: total,
                items: items
            };
            res.send(JSON.stringify(data));
        } catch (e) {
            res.send(JSON.stringify({
                status: 0,
                error: e.message
            }));
        }
    };

    const load = async(req, res) => {
        res.contentType('application/json');
        if (!Module.isAuthorizedAdmin(req)) {
            return res.send(JSON.stringify({
                status: 0
            }));
        }
        const id = req.query.id;
        if (!id || typeof id !== 'string' || !id.match(/^[a-f0-9]{24}$/)) {
            return res.send(JSON.stringify({
                status: 0
            }));
        }
        try {
            const item = await db.collection('pages').findOne({ _id: new ObjectID(id) });
            if (!item) {
                return res.send(JSON.stringify({
                    status: 0
                }));
            }
            return res.send(JSON.stringify({
                status: 1,
                item: {
                    _id: item._id,
                    pagename: item.pagename,
                    email: item.email,
                    status: item.status
                }
            }));
        } catch (e) {
            res.send(JSON.stringify({
                status: 0,
                error: e.message
            }));
        }
    };

    const folders = async(req, res) => {
        res.contentType('application/json');
        if (!Module.isAuthorizedAdmin(req)) {
            return res.send(JSON.stringify({
                status: 0
            }));
        }
        const data = req.body.folders;
        if (data && typeof data !== 'object') {
            return res.send(JSON.stringify({
                status: 0
            }));
        }
        try {
            const json = JSON.stringify(data);
            const updResult = await db.collection('registry').update({ name: 'pagesFolders' }, { name: 'pagesFolders', data: json }, { upsert: true });
            if (!updResult || !updResult.result || !updResult.result.ok) {
                return res.send(JSON.stringify({
                    status: 0
                }));
            }
            setTimeout(function() {
            return res.send(JSON.stringify({
                status: 1
            }));
            }, 1000);
        } catch (e) {
            return res.send(JSON.stringify({
                status: 0
            }));
        }
    };

    const save = async(req, res) => {
        res.contentType('application/json');
        if (!Module.isAuthorizedAdmin(req)) {
            return res.send(JSON.stringify({
                status: 0
            }));
        }
        const id = req.body.id;
        if (id && (typeof id !== 'string' || !id.match(/^[a-f0-9]{24}$/))) {
            return res.send(JSON.stringify({
                status: 0
            }));
        }
        let output = {};
        const fieldList = pagesFields.getUsersFields(id ? false : true);
        let fields = validation.checkRequest(req, fieldList);
        let fieldsFailed = validation.getCheckRequestFailedFields(fields);
        if (fieldsFailed.length > 0) {
            output.status = 0;
            output.fields = fieldsFailed;
            return res.send(JSON.stringify(output));
        }
        try {
            if (id) {
                const page = await db.collection('pages').findOne({ _id: new ObjectID(id) });
                if (page === null) {
                    output.status = -1;
                    output.fields = ['pagename'];
                    return res.send(JSON.stringify(output));
                }
                if (fields.pagename.value !== page.pagename) {
                    const pageDuplicate = await db.collection('pages').findOne({ pagename: fields.pagename.value });
                    if (pageDuplicate) {
                        output.status = -2;
                        output.fields = ['pagename'];
                        return res.send(JSON.stringify(output));
                    }
                }
            } else {
                const pageDuplicate = await db.collection('pages').findOne({ pagename: fields.pagename.value });
                if (pageDuplicate) {
                    output.status = -2;
                    output.fields = ['pagename'];
                    return res.send(JSON.stringify(output));
                }
            }
            let update = {
                pagename: fields.pagename.value,
                email: fields.email.value,
                status: fields.status.value
            };
            if (fields.password.value) {
                update.password = crypto.createHash('md5').update(config.salt + fields.password.value).digest('hex');
            }
            let what = id ? { _id: new ObjectID(id) } : { pagename: fields.pagename.value };
            let updResult = await db.collection('pages').update(what, { $set: update }, { upsert: true });
            if (!updResult || !updResult.result || !updResult.result.ok) {
                output.status = 0;
                return res.send(JSON.stringify(output));
            }
            output.status = 1;
            return res.send(JSON.stringify(output));
        } catch (e) {
            output.status = 0;
            log.error(e);
            res.send(JSON.stringify(output));
        }
    };

    const del = async(req, res) => {
        res.contentType('application/json');
        if (!Module.isAuthorizedAdmin(req)) {
            return res.send(JSON.stringify({
                status: 0
            }));
        }
        let output = {};
        let ids = req.body['id[]'];
        if (!ids || (typeof ids !== 'object' && typeof ids !== 'string') || !ids.length) {
            output.status = -1;
            return res.send(JSON.stringify(output));
        }
        if (typeof ids === 'string') {
            const id = ids;
            ids = [];
            ids.push(id);
        }
        let did = [];
        for (let i in ids) {
            const id = ids[i];
            if (!id.match(/^[a-f0-9]{24}$/)) {
                output.status = -2;
                return res.send(JSON.stringify(output));
            }
            did.push({ _id: new ObjectID(id) });
        }
        try {
            const delResult = await db.collection('pages').deleteMany({
                $or: did
            });
            if (!delResult || !delResult.result || !delResult.result.ok || delResult.result.n !== ids.length) {
                output.status = -3;
                return res.send(JSON.stringify(output));
            }
            output.status = 1;
            res.send(JSON.stringify(output));
        } catch (e) {
            output.status = 0;
            log.error(e);
            res.send(JSON.stringify(output));
        }
    };

    let router = Router();
    router.get('/list', list);
    router.get('/load', load);
    router.post('/save', save);
    router.post('/delete', del);
    router.post('/folders', folders);

    return {
        routes: router
    };
};
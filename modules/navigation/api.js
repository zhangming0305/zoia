const path = require('path');
const Module = require(path.join(__dirname, '..', '..', 'core', 'module.js'));
const Router = require('co-router');
const config = require(path.join(__dirname, '..', '..', 'core', 'config.js'));

module.exports = function(app) {
    const db = app.get('db');
    const templates = require(path.join(__dirname, 'templates.js'));

    const tpl = (s, d) => {
        for (let p in d) {
            s = s.replace(new RegExp('{' + p + '}', 'g'), d[p]);
        }
        return s;
    };

    const render = (data, prefix) => {
        let html = '';
        try {
            for (let i in data) {
                let item = data[i];
                if (item.parent === 'j1_1') {
                    let children = '';
                    for (let n in data) {
                        let sub = data[n];
                        if (sub.parent === item.id) {
                            children += tpl(templates['item_' + prefix], { id: sub.id, url: sub.data.url, title: sub.text });
                        }
                    }
                    if (children) {
                        html += tpl(templates['parent_' + prefix], { id: item.id, title: item.text, data: children });
                    } else {
                        html += tpl(templates['item_' + prefix], { id: item.id, url: item.data.url, title: item.text });
                    }
                }
            }
            if (html) {
                html = tpl(templates['wrap_' + prefix], { data: html });
            }
        } catch (e) {
            // Ignore
        }
        return html;
    };

    const save = async(req, res) => {
        res.contentType('application/json');
        if (!Module.isAuthorizedAdmin(req)) {
            return res.send(JSON.stringify({
                status: 0
            }));
        }
        let navigation = req.body.navigation;
        if (!navigation || typeof 'navigation' !== 'string') {
            return res.send(JSON.stringify({
                status: 0
            }));
        }
        try {
            const json = JSON.stringify(navigation);
            let updResult = await db.collection('navigation').update({ name: 'navigation' }, { name: 'navigation', data: json }, { upsert: true });
            if (!updResult || !updResult.result || !updResult.result.ok) {
                return res.send(JSON.stringify({
                    status: 0
                }));
            }
            for (let n in config.i18n.localeNames) {
                let data = render(navigation[n], 'd');
                updResult = await db.collection('navigation').update({ name: 'navigation_html_d_' + n }, { name: 'navigation_html_d_' + n, data: data }, { upsert: true });
                if (!updResult || !updResult.result || !updResult.result.ok) {
                    return res.send(JSON.stringify({
                        status: 0
                    }));
                }
                data = render(navigation[n], 'm');
                updResult = await db.collection('navigation').update({ name: 'navigation_html_m_' + n }, { name: 'navigation_html_m_' + n, data: data }, { upsert: true });
                if (!updResult || !updResult.result || !updResult.result.ok) {
                    return res.send(JSON.stringify({
                        status: 0
                    }));
                }
            }
            return res.send(JSON.stringify({
                status: 1
            }));
        } catch (e) {
            return res.send(JSON.stringify({
                status: 0
            }));
        }
    };
    let router = Router();
    router.post('/save', save);
    return {
        routes: router
    };
};
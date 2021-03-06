"use strict";

var Promise = require('es6-promise').Promise;
require('whatwg-fetch');

/**
 * Blackstar module.
 * @module Blackstar
 */

/**
* A Blackstar CMS client.
* @constructor
* @param {string} url - the url of the blackstar server. E.g. http://localhost:2999
* @param {object} options - an options object with type `{ showEditControls: boolean, token: string, authCallback: Response -> void }`
* @example
* var blackstar = new Client('https://localhost:2999', { token: '9f7sd9f7sf...', 
authCallback: function (response) {
    // response is HTTP 401 unauthorized. 
});  
*/
function Client(url, options) {
    this.serverUrl = url + (endsWithForwardSlash(url) ? '' : '/');
    this.apiUrl = this.serverUrl + 'api/content/';
    this.options = options || {
        showEditControls: false,
        token: null,
        authCallback: function () {}
    };
    this.options.showEditControls = this.options.showEditControls || false;
    this.options.authCallback = this.options.authCallback || function () {};
}

// Wrap fetch to add Authorization header if a token is supplied. 
Client.prototype.blackstarFetch = function blackstarFetch(url, options) {
    var tokenSupplied = this.options.token && this.options.token.length > 0; 
    var options = options || {};
    var client = this;
    options.headers = options.headers || {};
    if (tokenSupplied) {
        options.headers['Authorization'] = 'Bearer ' + this.options.token;
        docCookies.setItem('t', this.options.token, undefined,undefined,undefined,undefined);
    }
    options.credentials = options.credentials || 'include';
    return fetch(url, options).then(function (response) {
        const HTTP_UNAUTHORIZED = 401;
        if (response.status === HTTP_UNAUTHORIZED) {
            client.options.authCallback(response);
        }
        return response;
    });
};

/*
* Retrieve all content chunks.
* @returns {Array} A collection of chunks.   
*/
Client.prototype.getAll = function () {
    return this.blackstarFetch(this.apiUrl.slice(0, -1))
        .then(function (response) { return response.json(); })
        .then(this.enrichCollectionWithByMethods);
};
/**
 * Query for content chunks. Request can be by ids OR by tags OR by names. 
 * 
 * Querying by ids or by names is an OR query. I.e get the chunks with the name 'heading' or 'footer'. Querying by tags is an AND query. I.e. get the chunks with tags 'blackstarpedia' and 'english'.
 * @example
 * client.get({ ids: [1,2,3] });
 * @example
 * client.get({ names: ['heading','footer'] });
 * @example
 * client.get({ tags: ['blackstarpedia','english'] })
 * @param {object} request - an object specifying the query to perform.  
 * @returns {Array} A collection of chunks.   
 */
Client.prototype.get = function (request) {
    var url = this.requestToUrl(request);
    return this.blackstarFetch(url)
        .then(function (response) { return response.json(); })
        .then(this.enrichCollectionWithByMethods);
};
/*
 * Retrieve all chunk tags.
 * @returns {Array} An array of tags (strings).
 */
Client.prototype.getAllTags = function () {
    return this.blackstarFetch(this.serverUrl + 'api/tags').then(function (response) { return response.json(); });
};
/*
 * Update an existing chunk.
 */
Client.prototype.update = function (chunk) {
    return this.post(this.apiUrl + chunk.id, chunk);
};
Client.prototype.create = function (chunk) {
    return this.post(this.apiUrl.replace(/\/$/g, ''), chunk);
};
Client.prototype.delete = function (id) {
    return this.blackstarFetch(this.apiUrl + id, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        }
    });
};
Client.prototype.post = function post(url, data) {
    return this.blackstarFetch(url, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

Client.prototype.adminSearch = function (query) {
    return this.blackstarFetch(this.serverUrl + 'api/adminSearch/' + query)
        .then(function (response) { return response.json(); })
        .then(this.enrichCollectionWithByMethods);
};

Client.prototype.mediaSearch = function (query) {
    return this.blackstarFetch(this.serverUrl + 'api/mediaSearch/' + query)
        .then(function (response) { return response.json(); });
};

Client.prototype.createMedia = function (files) {
  var data = new FormData();
  for (var i = 0; i<files.length; i++) {
    let file = files[i];
    data.append(i.toString() + 'file', file);
    data.append(i.toString() + 'filename', file.name);
    data.append(i.toString() + 'type', file.type);
  }
  return this.blackstarFetch(this.serverUrl + 'api/media', {
    method: 'POST',
    body: data
  });
};

Client.prototype.deleteMedia = function (hash) {
    return this.blackstarFetch(this.serverUrl + 'api/media/' + hash, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        }
    });
};

Client.prototype.enrichCollectionWithByMethods = function(data) { 
    data.byName = function (name) { return data.find(function (item) { return item.name === name; }); };
    data.byId = function (id) { return data.find(function (item) { return item.id === id; }); };
    data.byTag = function (tag) { return data.filter(function (item) { return item.tags.some(function (t) { return t === tag; }); }); };
    return data;
};
Client.prototype.requestToUrl = function (request) {
    switch (this.requestKind(request)) {
        case 'ids':
            return this.apiUrl + 'byids/' + request.ids.join('/');
        case 'names':
            return this.apiUrl + 'bynames/' + request.names.join('/');
        case 'tags':
            return this.apiUrl + 'bytags/' + request.tags.join('/');
        default:
            throw new Error('Unknown request kind: ' + this.requestKind(request));
    }
};
Client.prototype.requestKind = function (request) {
    function isIdsRequest(request) {
        return isRequestKind(request, 'ids');
    }
    function isNamesRequest(request) {
        return isRequestKind(request, 'names');
    }
    function isTagsRequest(request) {
        return isRequestKind(request, 'tags');
    }
    function isRequestKind(request, kind) {
        return Object.keys(request).some(function (item) { return item === kind; });
    }
    if (isIdsRequest(request) && !isNamesRequest(request) && !isTagsRequest(request))
        return 'ids';
    if (!isIdsRequest(request) && isNamesRequest(request) && !isTagsRequest(request))
        return 'names';
    if (!isIdsRequest(request) && !isNamesRequest(request) && isTagsRequest(request))
        return 'tags';
    throw new Error("A request must include exactly one of the following collections: ids, names, tags");
};
Client.prototype.bind = function (chunks, selector) {
    if (typeof window === 'undefined')
        return;
    if (typeof window.document === 'undefined')
        return;
    chunks.forEach(function (chunk) {
        var el = !!selector ? selector(chunk) : document.querySelector('[data-blackstar-name="' + chunk.name + '"]');
        if (el) {
            el.setAttribute('data-blackstar-id', chunk.id);
            el.innerHTML = chunk.html;
        }
    });
    this.addEditLinks();
    this.addToolbox();
};
/**
 * Build the edit url for a chunk. Useful when implementing your own binding of content to UI, e.g. when binding content via Angular or React.
 * @param {object} chunk - the chunk to be edited.
 * @returns {string} the full edit url for chunk. 
 */
Client.prototype.urlFor = function (chunk) {
    return this.serverUrl + 'chunk/' + chunk.id;
};
/**
 * Adds edit links to all DOM elements having an attribute `data-blackstar-id` containing a chunk id. The hyperlink added to each element has the css class `blackstar-edit-link` to allow styling.
 * 
 * **Normally you don't need to call this function because it is called within `bind`.** It is exposed for the benefit of those manually binding their content without using the `bind` method.
 * @example
 * <div data-blackstar-id="123"></div>
 */
Client.prototype.addEditLinks = function () {
    if (typeof window === 'undefined')
        return;
    if (typeof window.document === 'undefined')
        return;
    var els = document.querySelectorAll('[data-blackstar-id]');
    for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var chunkId = el.getAttribute('data-blackstar-id');
        el.innerHTML += this.options.showEditControls ? ' <a class="blackstar-edit-link" target="_admin" href="' + this.serverUrl + 'chunk/' + chunkId + '" class="blackstar-link"><img style="width: 15px;opacity:0.4" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAE0AAABFCAYAAAAPWmvdAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAYdEVYdFNvZnR3YXJlAHBhaW50Lm5ldCA0LjAuOWwzfk4AAAK7SURBVHhe7dqxahtBFIVhv5OaBRVCjQpBWoOdIpA3iIqQRrgS2KQxpEkbSCNDajUpXKTRM6TJa6iazDUee2d1PHNnd1Z752qLD7FHuwL9eGWDdWGMGSWC4ygMjqMwOI7C4DgKg+O52G639gE/FwJH7fb3l6aaTMzkydysHv7aGZ+LwFEzP1i7cHDUCgdz+OHgqNH+27WZwlh1vHBw1IYXzImHg6M2adFIOBwcNcoZ7mjQLFc47+AcpId7by/zX8M70GD/47t9wM85qeFWvw72stfrvRcrnYtRvVvbQ3yOww5XfbSn+9d6ByVrRqgWn+2Mz3Wi4apLs/n9z57qX+cdlOqtN98p3PTaPo2vgWNJYj8trcLNj2/JOjiWInp7PUsKN1/ZQ3yOA8cScIM5rHCM37wEjtKlBnM44TjgKFnbYE6OcHCUqmswp2s4OEqUK9gLxgf+W+AoTfZgRHM0acEIHKWQGIzAUQKpwQgch9ZHsFx/oxE4Dkl6MALHoZQQjMBxCKUEI3A8tZKCETieUmnBCBxPpcRgBI6nUGowAse+lRyMwLFPpQcjcOyLhmAEjn3QEozAMTdNwQgcc9IWjMAxF43BCBxz0BqMwDGH3NGkBCNwzCVXOEnBCBxz6hpOWjACx9zahpMYjMAx1e5rxm8ePpMajMAx1Xpm3yjjPz3ccJKDETimOOzWZubecIZwnO/LDg2OKXbrmf/GO4QrIRiBY4qnW7MZoEW4UoIROHJ5t2YD53PJhSspGIEj1+NmAYM5rHDMr2xKAkeuzQLHqpP+m7ANOHIcHjdmASIh2sLBkSN2azZpCgdHDs6t2aQlHBxjUm7NF9Ol+fDl3l6OX7MkcIxh35qKQtXBMeZuCQI5SkPVwTFmeRRqbq4+6Q5VB8eQP3fLswxVB8eQnze39gE/dy7gOAqD4yjEXPwH/g5Basn3SRIAAAAASUVORK5CYII="/></a>' : '';
    }
};
/**
 * Adds the blackstar toolbox to the page. 
 * 
 * **Normally you don't need to call this function because it is called within `bind`.** It is exposed for the benefit of those manually binding their content without using the `bind` method.
 */
Client.prototype.addToolbox = function () {
    var link = document.createElement("link");
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', this.serverUrl + 'styles/pe-icons/pe-icon-7-stroke.css');
    document.body.appendChild(link);

    var container = document.createElement("div");
    container.setAttribute('id','blackstar-toolbox');
    container.setAttribute('style', 'color:rgb(148, 155, 162);position:fixed;top:10px;right:10px;background-color:#373942;padding:5px;opacity:0.5;border-radius:6px;z-index:99999;text-align:right;font-size:35px;margin:6px;');
    container.onmouseover = function () {
        this.style.opacity = 1;
    };
    container.onmouseout = function () {
        this.style.opacity = 0.5;
    };
    container.innerHTML = '<h3 style="color:#ffffff;margin:6px;padding:0;font-size:16px;">Blackstar CMS</h3>'
    container.innerHTML += '<a style="color:rgb(148, 155, 162)" target="_admin" href="' + this.serverUrl + 'search' + '" class="btn btn-default" href="#" role="button" style="margin:6px;"><span title="Search for content" class="pe-7s-search"></span></a>';
    container.innerHTML += '<a style="color:rgb(148, 155, 162)" title="Create a new chunk" target="_admin" href="' + this.serverUrl + 'newChunk' + '" class="btn btn-default" href="#" role="button" style="margin:6px;"><span title="Create a new chunk" class="pe-7s-plus"></span></a>';
    container.innerHTML += '<span class="pe-7s-look" title="Toggle edit links" style="margin:6px;"></span>';
    document.body.appendChild(container);
    
    var buttons = document.querySelectorAll('#blackstar-toolbox span');
    for (var i = 0; i < buttons.length; ++i) {
        var button = buttons[i];
        button.onmouseover = function () {
            this.style.color = 'white';
        };
        button.onmouseout = function () {
            this.style.color = 'rgb(148, 155, 162)';
        };
    }
};

function endsWithForwardSlash(input) {
    return /.+\/$/.test(input);
}

var toExport = {
    Client: Client
};

if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = toExport;
}

var docCookies = {
  getItem: function (sKey) {
    if (!sKey) { return null; }
    return decodeURIComponent(document.cookie.replace(new RegExp("(?:(?:^|.*;)\\s*" + encodeURIComponent(sKey).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=\\s*([^;]*).*$)|^.*$"), "$1")) || null;
  },
  setItem: function (sKey, sValue, vEnd, sPath, sDomain, bSecure) {
    if (!sKey || /^(?:expires|max\-age|path|domain|secure)$/i.test(sKey)) { return false; }
    var sExpires = "";
    if (vEnd) {
      switch (vEnd.constructor) {
        case Number:
          sExpires = vEnd === Infinity ? "; expires=Fri, 31 Dec 9999 23:59:59 GMT" : "; max-age=" + vEnd;
          break;
        case String:
          sExpires = "; expires=" + vEnd;
          break;
        case Date:
          sExpires = "; expires=" + vEnd.toUTCString();
          break;
      }
    }
    document.cookie = encodeURIComponent(sKey) + "=" + encodeURIComponent(sValue) + sExpires + (sDomain ? "; domain=" + sDomain : "") + (sPath ? "; path=" + sPath : "") + (bSecure ? "; secure" : "");
    return true;
  },
  removeItem: function (sKey, sPath, sDomain) {
    if (!this.hasItem(sKey)) { return false; }
    document.cookie = encodeURIComponent(sKey) + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT" + (sDomain ? "; domain=" + sDomain : "") + (sPath ? "; path=" + sPath : "");
    return true;
  },
  hasItem: function (sKey) {
    if (!sKey) { return false; }
    return (new RegExp("(?:^|;\\s*)" + encodeURIComponent(sKey).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=")).test(document.cookie);
  },
  keys: function () {
    var aKeys = document.cookie.replace(/((?:^|\s*;)[^\=]+)(?=;|$)|^\s*|\s*(?:\=[^;]*)?(?:\1|$)/g, "").split(/\s*(?:\=[^;]*)?;\s*/);
    for (var nLen = aKeys.length, nIdx = 0; nIdx < nLen; nIdx++) { aKeys[nIdx] = decodeURIComponent(aKeys[nIdx]); }
    return aKeys;
  }
};

if (typeof window === 'object') {
  window.Blackstar = toExport;   
  // register an error logger
  window.onerror = function (message, file, line, col, error) {
    try {
        fetch('/api/throw', {
            method: 'POST',
            body: JSON.stringify({
                file,
                line,
                col,
                message,
                stack: error.stack,
                context: navigator.userAgent
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        }).catch(e => {console.error(e);});
    } catch (e) {}
  };
}


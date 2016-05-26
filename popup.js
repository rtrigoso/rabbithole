var _css_selector = '';

var _root_frame_id = null;

var _num_callbacks_expected = 0;
var _num_callbacks_received = 0;
var _curr_tab_id = null;
var _nodecount = 0;
var _node_data = [];

var _ad_objects = 0;
var _frame_objects = {};

var _last_highlighted_node = null;
var _last_highlighted_node_bg = null;

var _loaded = 0;
var _performance_obj = {};

function shorten (str, maxlen)
{
    if (str.length <= maxlen)
    {
        return str;
    }

    var halflen = parseInt (maxlen / 2 - 3);
    return str.substring (0, halflen) + '...' + str.substring (str.length - halflen);
}

function parse_url (url)
{
    var parser = document.createElement('a'),
        searchObject = {},
        queries, split, i;

    // Let the browser do the work
    parser.href = url;
    // Convert query string to object
    queries = parser.search.replace(/^\?/, '').split('&');
    for( i = 0; i < queries.length; i++ ) {
        split = queries[i].split('=');
        searchObject[split[0]] = split[1];
    }

    return {
        protocol: parser.protocol,
        host: parser.host,
        hostname: parser.hostname,
        port: parser.port,
        pathname: parser.pathname,
        search: parser.search,
        searchObject: searchObject,
        hash: parser.hash
    };
}

function extract_domain (hostname)
{
    var matches = hostname.match (/([^.]+\.[^.]+)$/);
    if (!matches)
    {
        return '';
    }

    return matches[1];
}

function extract_hostname (url)
{
    if (url.match (/^javascript:/))
    {
        return "";
    }
    if (!url.match (/^(http:|https:|\/\/)/))
    {
        return "";
    }

    var url_info = parse_url (url);
    return url_info.hostname;
}

function render_branch (o, depth)
{
    if (typeof depth === 'undefined')
    {
        depth = 0;
    }

    var markup = '';
    for (var i = 0; i < depth; i++)
    {
        markup += "  ";
    }

    _nodecount++;
    var label_id = "label-" + _nodecount;
    var cb_id = "cb-" + _nodecount;
    _node_data[label_id] = o;

    var caption = "&nbsp;&nbsp" + o.tagname;
    if (o.id)
    {
        caption += " id=" + shorten (o.id, 45);
    }
    else if (o.class)
    {
        caption += " class=" + shorten (o.class, 45);
    }

    if (o.src)
    {
        caption += " (<span class=\"el-src-host\">" + extract_hostname (o.src) + "</span>)";
    }

    var node_class = "tree-node icon-" + o.tagname;
    if (is_potential_ad_creative (o))
    {
        node_class += " ad-image";
    }

    var timed = "";
    if(o.startTime > 0) timed = Math.round(o.startTime + o.duration) + "ms to load"
    markup += '<li><label id="' + label_id + '" class="' + node_class + '">'
        + caption + " " + timed
        + '</label><input type="checkbox" checked id="' + cb_id + '" />'

    if (o.children.length == 0)
    {
        markup += "</li>\n";
        return markup;
    }

    markup += "\n";
    for (var i = 0; i < depth; i++)
    {
        markup += "  ";
    }
    markup += "<ol>\n"

    for (var i = 0; i < o.children.length; i++)
    {
        markup += render_branch (o.children[i], depth + 1);
    }

    for (var i = 0; i < depth; i++)
    {
        markup += "  ";
    }
    markup += "</ol>\n"

    return markup;
}

function is_potential_ad_creative (o)
{
    if (o.tagname === "img")
    {
        return !is_beacon (o);
    }

    if (o.tagname === "form")
    {
        return true;
    }

    if ((typeof o.background_image !== 'undefined') && (o.background_image !== ''))
    {
        return true;
    }

    return false;
}

function add_longest_duration_to_parent (o)
{
  if(typeof o.parent !== "undefined"){
    var parent = o.parent;
    if((o.duration + o.startTime) > parent.duration + parent.startTime){
      parent.startTime = o.startTime;
      parent.duration = o.duration;
      add_longest_duration_to_parent (parent);
    }
  }
}

function is_beacon (o)
{
    if ((typeof o.width !== 'undefined') && (typeof o.height !== 'undefined'))
    {
        if ((o.width <= 1) && (o.height <= 1))
        {
            return true;
        }
    }

    // @TODO: what about invisible images?

    return false;
}

function gather_scripts_performance(objects){
  for (var k = 0; k < Object.keys(objects).length; k++){
    var object = objects[Object.keys(objects)[k]];

    if(object.tagname === "iframe" || object.tagname === "script" || object.tagname === "img" ){
      _performance_obj[object.src] = {
        "duration" : object.duration,
        "startTime": object.startTime
      };
    }

    if(typeof object.children === "undefined") continue;
    if(object.children.length <= 0) continue;

    gather_scripts_performance(object.children);
  }
}

function analyze_branch (o, depth, network_path)
{
    if (typeof depth === 'undefined')
    {
        depth = 0;
    }

    if (typeof network_path === 'undefined')
    {
        network_path = [];
    }

    o.domain = ''
    if (o.src)
    {
        o.src_hostname = extract_hostname (o.src);
        if (o.src_hostname)
        {
            o.domain = extract_domain (o.src_hostname);
        }

        if ( typeof _performance_obj[o.src] !== "undefined"){
          o.duration = _performance_obj[o.src].duration;
          o.startTime = _performance_obj[o.src].startTime;
          add_longest_duration_to_parent (o)
        }
    }
    if (o.background_image)
    {
        // @TODO -- I don't know exactly what these background image properties
        // will look like; need to find some examples
        o.bgimg_hostname = extract_hostname (o.background_image);
        if (o.bgimg_hostname)
        {
            o.domain = extract_domain (o.bgimg_hostname);
        }
    }

    o.network_path = '';
    if (o.domain)
    {
        if (network_path.length > 0)
        {
            if (o.domain !== network_path[network_path.length - 1])
            {
                network_path.push (o.domain);
            }
        }
        else
        {
            network_path.push (o.domain);
        }

        o.network_path = network_path.join (', ');
    }

    o.stats = {
            scripts: 0,
            scripts_offsite: 0,
            iframes: 0,
            iframes_offsite: 0,
            images: 0,
            beacons: 0,
            startTime: 0,
            duration: 0,
    };

    if (o.tagname === 'script')
    {
        o.stats.scripts++;
        if (o.src_hostname)
        {
            o.stats.scripts_offsite++;
        }
    }

    if (o.tagname === 'iframe')
    {
        o.stats.iframes++;
        if (o.src_hostname)
        {
            o.stats.iframes_offsite++;
        }
    }

    if (o.background_image)
    {
        o.stats.images++;
    }

    if (o.tagname === 'img')
    {
        o.stats.images++;
        o.is_beacon = is_beacon (o);
        if (o.is_beacon)
        {
            o.stats.beacons++;
        }
    }

    var old_network_path = JSON.parse (JSON.stringify (network_path));
    for (var i = 0; i < o.children.length; i++)
    {
        var child = o.children[i];
        child.parent = o;
        analyze_branch (child, depth+1, network_path);

        o.stats.scripts += child.stats.scripts;
        o.stats.scripts_offsite += child.stats.scripts_offsite;
        o.stats.iframes += child.stats.iframes;
        o.stats.iframes_offsite += child.stats.iframes_offsite;
        o.stats.images += child.stats.images;
        o.stats.beacons += child.stats.beacons;
    }

    // empty the network_path array and rebuild it
    network_path.splice(0, network_path.length)
    for (var i = 0; i < old_network_path.length; i++)
    {
        network_path.push (old_network_path[i]);
    }
}


function merge_branch (o)
{
    if ((o.tagname === 'iframe'))
    {

        if (typeof _frame_objects[o.src] !== 'undefined')
        {
            // console.log ("[merge_branch] attaching iframe contents using src=" + o.src);
            o.children = [ _frame_objects[o.src] ];
        }
        else
        {
            // console.log ("[merge_branch] could not find iframe contents matching src=" + o.src);
            return;
        }
    }

    for (var i = 0; i < o.children.length; i++)
    {
        merge_branch (o.children[i]);
    }
}

function postprocess_trees ()
{
    gather_scripts_performance(_frame_objects);

    for (var i = 0 ; i < _ad_objects.length; i++)
    {
        var ad_obj = _ad_objects[i];
        ad_obj.timer = 0;
        merge_branch (ad_obj);
        analyze_branch (ad_obj);
    }
}

function add_events ()
{
    var sel = document.getElementById('ad-el-selector');

    sel.addEventListener ('change', function (e) {

        // show the appropriate tree...
        for (var i = 0; i < _ad_objects.length; i++)
        {
            var ad_obj = _ad_objects[i];

            var i1 = i + 1;
            var div = document.getElementById('ad-el-' + i1);
            if (i1 == e.target.value)
            {
                div.className = "ad-el-tree selected";

                var label_elements = div.getElementsByTagName ('label');
                if (label_elements.length > 0)
                {
                    label_elements[0].click ();
                }

                // scroll to and highlight the ad element
                chrome.tabs.sendMessage(_curr_tab_id,
                    { text: "scroll_into_view", idx: i },
                    { frameId: _root_frame_id });
            }
            else
            {
                div.className = "ad-el-tree";
            }
        }

    });

    document.onclick = function(e) {
        var el = e.target;
        if (!el.className.match (/tree-node/)) {
            return;
        }

        if (_last_highlighted_node !== null)
        {
            _last_highlighted_node.style.backgroundColor = _last_highlighted_node_bg;
        }
        _last_highlighted_node = el;
        _last_highlighted_node_bg = el.style.backgroundColor;
        el.style.backgroundColor = '#88caf3';

        var o = _node_data[el.id];

        var markup = "<table>\n<tr><td width=\"120\"><strong>tag</strong></td><td>" + o.tagname + "</td></tr>\n";

        if (o.id)
        {
            markup += "<tr><td><strong>id</strong></td><td>" + o.id + "</td></tr>\n";
        }
        if (o.class)
        {
            markup += "<tr><td><strong>class</strong></td><td>" + o.class + "</td></tr>\n";
        }

        var img_src = null;
        if (typeof o.background_image !== 'undefined')
        {
            markup += "<tr><td><strong>backgroundImage:</strong></td><td>" + o.background_image + "</td></tr>\n";
            var bg = o.background_image;
            bg = bg.replace(/^url\("(.*)"\)$/,'$1');
            bg = bg.substring(bg.indexOf("images") > -1 ? bg.indexOf("images") : 0);
            img_src = bg;
        }

        if (typeof o.href !== 'undefined')
        {
            var url = o.href;
            var url_short = shorten (url, 50);

            if (url.match (/^\/\//))
            {
                url = "https:" + url;
            }

            var enc_url = url.replace(/[\u00A0-\u9999<>\&]/gim, function(i) {
               return '&#'+i.charCodeAt(0)+';';
            });
            var enc_url_short = url_short.replace(/[\u00A0-\u9999<>\&]/gim, function(i) {
               return '&#'+i.charCodeAt(0)+';';
            });
            markup += "<tr><td><strong>href</strong></td><td><a href=\"" + enc_url
                + "\">" + enc_url_short + "</a></td></tr>\n";
        }

        if (typeof o.src !== 'undefined')
        {
            var url = o.src;
            var url_short = shorten (url, 50);

            if (url.match (/^\/\//))
            {
                url = "https:" + url;
            }

            var enc_url = url.replace(/[\u00A0-\u9999<>\&]/gim, function(i) {
               return '&#'+i.charCodeAt(0)+';';
            });
            var enc_url_short = url_short.replace(/[\u00A0-\u9999<>\&]/gim, function(i) {
               return '&#'+i.charCodeAt(0)+';';
            });
            markup += "<tr><td><strong>src</strong></td><td><a href=\"" + enc_url
                + "\">" + enc_url_short + "</a></td></tr>\n";

            if (o.tagname === 'img')
            {
                img_src = url;
            }
        }

        var img = document.getElementById('img-detail-image');
        if (img_src === null)
        {
            img.style.display = 'none';
        }
        else
        {
            img.style.display = 'block';
            img.src = img_src;
        }

        if (typeof o.height !== 'undefined')
        {
            markup += "<tr><td><strong>height</strong></td><td>" + o.height + "</td></tr>\n";
        }

        if (typeof o.width !== 'undefined')
        {
            markup += "<tr><td><strong>width</strong></td><td>" + o.width + "</td></tr>\n";
        }

        if (o.network_path)
        {
            markup += "<tr><td><strong>network path:</strong></td><td>" + o.network_path + "</td></tr>\n";
        }

        if (typeof o.is_beacon !== 'undefined')
        {
            var val = (o.is_beacon) ? 'yes' : 'no';
            markup += "<tr><td><strong>is beacon:</strong></td><td>" + val + "</td></tr>\n";
        }

        var stats = [];
        if (o.stats.scripts > 0)
        {
            var stat = "scripts: " + o.stats.scripts;
            if (o.stats.scripts_offsite > 0)
            {
                stat += " (" + o.stats.scripts_offsite + " offsite)";
            }
            stats.push (stat);
        }
        if (o.stats.iframes > 0)
        {
            var stat = "iframes: " + o.stats.iframes;
            if (o.stats.iframes_offsite > 0)
            {
                stat += " (" + o.stats.iframes_offsite + " offsite)";
            }
            stats.push (stat);
        }
        if (o.stats.images > 0)
        {
            stats.push ("images: " + o.stats.images);
        }
        if (o.stats.beacons > 0)
        {
            stats.push ("beacons: " + o.stats.beacons);
        }
        if (o.startTime > 0){
          stats.push ("start time: " + o.startTime);
        }
        if (o.duration > 0){
          stats.push ("duration: " + o.duration);
        }

        if (stats.length > 0)
        {
            markup += "<tr><td><strong>stats</strong></td><td>"
                + stats.join ("<br />\n")
                + "</td></tr>\n";
        }

        markup += "</table>\n";

        var div = document.getElementById('div-detail-text');
        div.innerHTML = markup;

        var aTags = document.getElementsByTagName('a');
        for(i = 0; i < aTags.length; i++){
          aTags[i].addEventListener('click', function(event){
            event.preventDefault();
            chrome.windows.create({"url":enc_url})
          });
        }

    };
}

function render ()
{
    if(typeof _ad_objects === 'undefined') return false;
    // merge in the iframe information and analyze the trees
    postprocess_trees ();

    var div_list = document.getElementById('div-list');
    var span_sel = document.getElementById('span-sel');
    if (_ad_objects.length == 0)
    {
        div_list.innerHTML = "<p>no ad elements found</p></div></div>\n";
        return;
    }

    if (_ad_objects.timer !== 0){
      console.log(_ad_objects);
    }

    var tree_markup = '';
    var dropdown_markup = "<select id=\"ad-el-selector\">\n<option value=\"0\"></option>\n";

    _nodecount = 0;
    _node_data = [];
    for (var i = 0; i < _ad_objects.length; i++)
    {
        var ad_obj = _ad_objects[i];
        var i1 = i + 1;

        dropdown_markup += '<option value="' + i1 + '">' + ad_obj.id + "</option>\n";
        tree_markup += '<div class="ad-el-tree" id="ad-el-' + i1 + '"><ol class="tree">';

        tree_markup += render_branch (ad_obj);
        tree_markup += '</ol></div>';
    }
    dropdown_markup += "</select>\n";

    span_sel.innerHTML = dropdown_markup;
    div_list.innerHTML = tree_markup;

    add_events ();
}


function scan_frame_callback (el)
{
    _num_callbacks_received++;
    if (typeof el !== 'undefined')
    {
        _frame_objects[el.frame.frameId] = el;
    }

    if (_num_callbacks_received == _num_callbacks_expected)
    {
        render ();
    }
}

function scan_page_callback (ad_objects)
{
    _num_callbacks_received++;

    // console.log ('[scan_page_callback] callback ' + _num_callbacks_received
    //    + "/" + _num_callbacks_expected + '...');

    _ad_objects = ad_objects;

    if (_num_callbacks_received == _num_callbacks_expected)
    {
        render ();
    }
}

function on_content_script_executed ()
{
    _num_callbacks_received = 0;
    console.log ("scanning for frames...");
    chrome.webNavigation.getAllFrames({ tabId: _curr_tab_id }, function(details) {
        message_details = [];
        details.forEach(function(frame) {
            if (frame.errorOccurred)
            {
                return;
            }

            if (frame.parentFrameId === -1)
            {
                _root_frame_id = frame.frameId;
                message_details.push ({
                    text: 'scan_page',
                    frameId: frame.frameId,
                    parentFrameId: frame.parentFrameId,
                    url: frame.url,
                    selector: _css_selector
                });
            }
            else
            {
                message_details.push ({
                    text: 'scan_frame',
                    frameId: frame.frameId,
                    parentFrameId: frame.parentFrameId,
                    url: frame.url
                });
            }
        });

        _num_callbacks_expected = message_details.length;
        for (var i = 0; i < message_details.length; i++)
        {
            var deets = message_details[i];
            var callback = null;

            if (deets.text == 'scan_frame')
            {
                callback = scan_frame_callback;
            }
            else
            {
                callback = scan_page_callback;
            }

            chrome.tabs.sendMessage(_curr_tab_id, deets,
                { frameId: deets.frameId }, callback);
        }
    });
}

chrome.runtime.onMessage.addListener(function (request, sender, callback) {
    // If the received message has the expected format...
    if(_loaded != 1){
      switch (request.text)
      {
          case 'start':
              // console.log ("start message received...");
              _curr_tab_id = request.tab_id;

              chrome.storage.sync.get({
                  css_selector: "[id*='my-ad-idbase-']"
                }, function(items) {
                  //  console.info(items);
                  _css_selector = items.css_selector;
                  on_content_script_executed ();
                  _loaded = 1;
              });

              break;
      }
    }
});

document.addEventListener('DOMContentLoaded', function() {
    document.querySelector('#go-to-options').addEventListener('click', function() {
        if (chrome.runtime.openOptionsPage) {
            // New way to open options pages, if supported (Chrome 42+).
            chrome.runtime.openOptionsPage();
        } else {
            // Reasonable fallback.
            window.open(chrome.runtime.getURL('options.html'));
        }
    });
});

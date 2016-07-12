var _css_selector = '';

var _root_frame_id = null;

var _num_callbacks_expected = 0;
var _num_callbacks_received = 0;
var _curr_tab_id = null;
var _nodecount = 0;
var _node_data = [];

var _ad_objects = 0;
var _frame_objects = {};
var _frame_objects_sub = {};

var _last_highlighted_node = null;
var _last_highlighted_node_bg = null;

var _performance_obj = {};
var _longest_duration = 0;
var _load_page_start = null;

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
    if(Math.round((o.loadStart - _load_page_start) + o.duration) > 0){
      timed = "<h4 style='display:inline-block'>"
      + Math.round((o.loadStart - _load_page_start) + o.duration)
      + "ms"
      + "</h4>"
    }
    markup += '<li><label id="' + label_id + '" class="' + node_class + '" for="' + cb_id +'">'
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

    if( typeof parent.loadStart === "undefined"
        || (typeof parent.loadStart !== "undefined" && +parent.loadStart < +o.loadStart)
    ){
      parent.loadStart = o.loadStart;
    }

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
  var n = Object.keys(objects);

  for (var k = 0; k < n.length; k++){
    var object = objects[n[k]];

    if(object.tagname === "iframe" || object.tagname === "script" || object.tagname === "img" ){
      _performance_obj[object.src] = {
        "duration" : object.duration,
        "startTime": object.startTime,
        "loadStart": object.loadStart,
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
          o.loadStart = _performance_obj[o.src].loadStart;
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
            loadStart: 0,
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
    if (o.tagname === 'iframe')
    {
        var frame_id = o['data-rabbithole-frameid'];
        if (typeof _frame_objects_sub[frame_id] !== 'undefined')
        {
            o.children = [ _frame_objects_sub[frame_id] ];

            for(var i = 0; i < o.children.length; i++){
              o.children[i].parent = o;
            }
        }
    }

    for (var i = 0; i < o.children.length; i++)
    {
        merge_branch (o.children[i]);
    }
}

function get_children_frame_objects ()
{
    var n = Object.keys(_frame_objects);

    for (var k = 0; k < n.length; k++)
    {
      var frame = _frame_objects[n[k]];

      if(typeof frame === "undefined") continue;
      if(typeof frame.frame === "undefined") continue;
      if(frame.frame.parentFrameId === 0) continue;
      if(frame.frame.url === "about:blank" || typeof frame.frame.url === "undefined") continue;
      if(typeof _frame_objects_sub[frame.frame.rhFrameId] !== "undefined") continue;
      // if(typeof _frame_objects_sub[frame.frame.rhFrameId] === "undefined" && _frame_objects_sub[frame.frame.rhFrameId].children.length <= 0) continue;

      _frame_objects_sub[frame.frame.rhFrameId] = frame;
    }
}

function postprocess_trees ()
{
    get_children_frame_objects();
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
    var sel = document.getElementById('div-list');

    sel.addEventListener ('click', function (e) {

        var child = document.getElementById("selected-tree-marker");
        if(child != null) child.parentElement.removeChild(child);

        // show the appropriate tree...
        for (var i = 0; i < _ad_objects.length; i++)
        {
            var ad_obj = _ad_objects[i];

            var i1 = i + 1;
            var div = document.getElementById('ad-el-' + i1);

            if(typeof e.target.id === "undefined") e.target.id = 0;

            if (i1 == e.target.id)
            {
                div.className = "ad-el-tree selected";
                console.log(document.getElementById(i1).parentElement);
                document.getElementById(i1).parentElement.innerHTML += "<span id='selected-tree-marker'><img src='/icon16.png' style='width:1em; height:1em; -webkit-transform: scaleX(-1); transform: scaleX(-1); filter: FlipH;'></span>";

                var label_elements = div.getElementsByTagName ('label');
                if (label_elements.length > 0)
                {
                    label_elements[0].click ();
                }

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
        el.style.backgroundColor = 'rgba(136, 202, 244, 0.6)';

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
            // bg = bg.substring(bg.indexOf("images") > -1 ? bg.indexOf("images") : 0);
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
        // if (o.duration > 0){
        //   stats.push ("duration: " + Math.round(o.startTime + o.duration) + "ms");
        // }
        if (o.loadStart > 0){
          stats.push ("start time: " + toFullLocaleTimeString(o.loadStart) + "");
          stats.push ("end time: " + toFullLocaleTimeString(o.loadStart + o.duration) +"");
          stats.push ("Time (rel): " + Math.round(o.duration) + "ms");
          stats.push ("Time (abs): " + Math.round((o.loadStart - _load_page_start) + o.duration) + "ms");
        }

        if (stats.length > 0)
        {
            markup += "<tr><td><strong>stats</strong></td><td>"
                + stats.join ("<br />\n")
                + "</td></tr>\n";
        }

        markup += "</table>\n";

        var div = document.getElementById('div-detail-desc');
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

function toFullLocaleTimeString(d){
  var date = new Date(d);
  return pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds()) + "." + date.getMilliseconds();
}

function pad(n) {
    return (n < 10) ? ("0" + n) : n;
}

function render ()
{
    if(typeof _ad_objects === 'undefined') return false;
    // merge in the iframe information and analyze the trees
    postprocess_trees ();

    var div_list = document.getElementById('div-list');
    var div_text = document.getElementById('div-detail-text');
    var span_sel = document.getElementById('span-sel');
    if (_ad_objects.length == 0)
    {
        div_list.innerHTML = "<p>no ad elements found</p></div></div>\n";
        return;
    }

    div_list.innerHTML = "";

    var tree_markup = '';
    var dropdown_markup = "<select id=\"ad-el-selector\">\n<option value=\"0\"></option>\n";
    var css_selector = _css_selector.replace(/(\[id\*=')|('])/g,'');

    _nodecount = 0;
    _node_data = [];

    for (var i = 0; i < _ad_objects.length; i++)
    {
        var ad_obj = _ad_objects[i];
        var timer = (ad_obj.startTime + ad_obj.duration);
        var timer = timer !== 0 ? timer + (ad_obj.loadStart - _load_page_start) : 0;
        var i1 = i + 1;
        div_list.innerHTML += '<div class="perf-bar" ><span id="' + i1 + '" >'
          + ad_obj.id.replace(css_selector,'')
          + ' ' + Math.round(timer) + 'ms'
          + '</span><span style="display: none" >'
          + Math.round(timer)
          + 'ms</span></div>';

        if(timer > _longest_duration) _longest_duration = timer;
        // dropdown_markup += '<option value="' + i1 + '">' + ad_obj.id + "</option>\n";
        tree_markup += '<div class="ad-el-tree" id="ad-el-' + i1 + '"><ol class="tree">';
        tree_markup += render_branch (ad_obj);
        tree_markup += '</ol></div>';
    }
    // dropdown_markup += "</select>\n";

    //span_sel.innerHTML = dropdown_markup;
    div_text.innerHTML = tree_markup;
    post_render()
    add_events ();
}

// function return_checked_image(path){
//     var test_element = document.createElement('img');
//     test_element.onError = function(){
//         return null;
//     }
//
//     test_element.src = path;
//     return path;
// }
//
// function image_element_error(el, k){
//     return null;
// }

function post_render(){
  var perf_bars = document.getElementsByClassName('perf-bar');
  var max_width = "790px";

  for(var i = 0; i < perf_bars.length; i++){
    var perf_bar = perf_bars[i];
    var timer = parseInt(perf_bar.children[1].innerHTML);

    if(timer == 0){
      perf_bar.children[0].style.width = max_width;
      perf_bar.children[0].style.backgroundColor = "#ebebeb";
      perf_bar.removeChild(perf_bar.children[1]);
      continue;
    }

    var calculated_length = Math.floor((timer * 790) / (_longest_duration + 1000));
    perf_bar.children[0].style.width = calculated_length + "px";

    if (timer > 4000){
      perf_bar.children[0].style.backgroundColor = "#cb3535";
    }
    else if (timer > 2000){
      perf_bar.children[0].style.backgroundColor = "#fdae61";
    }

  }
}

function scan_frame_callback (el)
{
    _num_callbacks_received++;
    if (typeof el !== 'undefined')
    {
        _frame_objects[el.frame.rhFrameId] = el;
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


chrome.runtime.onMessage.addListener(function (request, sender, callback) {
    // If the received message has the expected format...
    switch (request.text)
    {
        case 'start':
            console.log ("start message received...");
            _curr_tab_id = request.tab_id;
            start ();

            break;
    }
});

function start ()
{
    console.log ("[popup] start()...");

    chrome.storage.sync.get({
        css_selector: "[id*='my-ad-idbase-']"
      }, function(items) {
        //  console.info(items);
        _css_selector = items.css_selector;
        set_frame_ids ();
    });

    chrome.tabs.executeScript(
      _curr_tab_id,
      {code: 'var x = performance.timing.navigationStart; x'},
      function(r){
        _load_page_start = r[0];

        var s = new Date(_load_page_start)
        document.getElementById('load_page_start').innerHTML = "Navigation Start Time: " + toFullLocaleTimeString(s);
      }
    );
}

function set_frame_ids ()
{
    console.log ("setting all frame ids recursively...");
    chrome.webNavigation.getAllFrames({ tabId: _curr_tab_id }, function(details) {
        details.forEach(function(frame) {
            if (frame.errorOccurred)
            {
                return;
            }
            if (frame.parentFrameId !== -1)
            {
                chrome.tabs.sendMessage(_curr_tab_id, { text: 'receive_frame_id', frameId: frame.frameId },
                    { frameId: frame.frameId }, null);
                return;
            }

            chrome.tabs.sendMessage(_curr_tab_id, { text: 'set_frame_ids', frameId: frame.frameId },
                { frameId: frame.frameId }, scan_all_frames);
        });
    });
    
}

function scan_all_frames ()
{
    _num_callbacks_received = 0;
    console.log ("scanning all frames...");
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
                console.log ("  - " + frame.parentFrameId + " -> " + frame.frameId + " (" + shorten (frame.url, 120) + ")...");
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

document.addEventListener('DOMContentLoaded', function() {
    console.log ("[popup] DOMContentLoaded");
    document.querySelector('#go-to-options').addEventListener('click', function(event) {
        event.preventDefault();
        if (chrome.runtime.openOptionsPage) {
            // New way to open options pages, if supported (Chrome 42+).
            chrome.runtime.openOptionsPage();
        } else {
            // Reasonable fallback.
            window.open(chrome.runtime.getURL('options.html'));
        }
    });
});

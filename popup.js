function rh_popup ()
{


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
        var parser = document.createElement ('a'),
            searchObject = {},
            queries, split, i;

        // Let the browser do the work
        parser.href = url;
        // Convert query string to object
        queries = parser.search.replace (/^\?/, '').split ('&');
        for (i = 0; i < queries.length; i++)
        {
            split = queries[i].split ('=');
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
        var i;

        if (typeof depth === 'undefined')
        {
            depth = 0;
        }

        var markup = '';
        for (i = 0; i < depth; i++)
        {
            markup += "  ";
        }

        _nodecount++;
        var label_id = "label-" + _nodecount;
        var cb_id = "cb-" + _nodecount;
        _node_data[label_id] = o;

        var caption = "&nbsp;&nbsp" + o.tagname;
        if (o.frame)
        {
            caption += " [" + o.frame.frame_id + "]";
        }
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
        if (Math.round ((o.performance.loadStart - _load_page_start) + o.performance.duration) > 0)
        {
            timed = "<h4 style='display:inline-block'>"
                + Math.round ((o.performance.loadStart - _load_page_start) + o.performance.duration)
                + "ms"
                + "</h4>"
        }

        var expanding_textbox = '<input type="checkbox" checked id="' + cb_id + '" />';
        if (typeof o.parent === "undefined") expanding_textbox = '';
        markup += '<li><label id="' + label_id + '" class="' + node_class + '" for="' + cb_id + '">'
            + caption + " " + timed
            + '</label>' + expanding_textbox

        if (o.children.length == 0)
        {
            markup += "</li>\n";
            return markup;
        }

        markup += "\n";
        for (i = 0; i < depth; i++)
        {
            markup += "  ";
        }
        markup += "<ol>\n";

        for (i = 0; i < o.children.length; i++)
        {
            markup += render_branch (o.children[i], depth + 1);
        }

        for (i = 0; i < depth; i++)
        {
            markup += "  ";
        }
        markup += "</ol>\n";

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


    function build_el_caption (o)
    {
        var caption = o.tagname;
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
            caption += " (" + extract_hostname (o.src) + ")";
        }

        return caption;
    }

    function aggregate_performance (o)
    {
        if (typeof o.parent === "undefined")
        {
            return;
        }

        var parent = o.parent;

        // we start at a leaf and work our way up until we find the first
        // node with recorded performance data; once we hit that, all nodes
        // up the tree will either have recorded values or calculated values
        if (!o.performance.recorded && (typeof o.performance.calculated === 'undefined'))
        {
            aggregate_performance (parent);
            return;
        }

        var changed_parent_performance = false;


        // if we don't have any recorded or calculated data for the parent, just take the child's data
        if (!parent.performance.recorded && (typeof parent.performance.calculated === 'undefined'))
        {
            parent.performance.loadStart = o.performance.loadStart;
            parent.performance.duration = o.performance.duration;
            changed_parent_performance = true;
        }
        else
        {
            if (o.performance.loadStart < parent.performance.loadStart)
            {
                parent.performance.duration += (parent.performance.loadStart - o.performance.loadStart);
                parent.performance.loadStart = o.performance.loadStart;
                changed_parent_performance = true;
            }
            var child_complete = o.performance.loadStart + o.performance.duration;
            if (child_complete > (parent.performance.loadStart + parent.performance.duration))
            {
                parent.performance.duration = child_complete - parent.performance.loadStart;
                changed_parent_performance = true;
            }
        }


        // only recurse upward if something has changed
        if (changed_parent_performance)
        {
            parent.performance.calculated = true;
            aggregate_performance (parent);
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

    function analyze_branch (o, depth, network_path)
    {
        var i;

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

        // if this is a leaf, work your way back up the tree to calculate overall start/end times for parents
        if (o.children.length == 0)
        {
            aggregate_performance (o);
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
        for (i = 0; i < o.children.length; i++)
        {
            var child = o.children[i];
            child.parent = o;
            analyze_branch (child, depth + 1, network_path);

            o.stats.scripts += child.stats.scripts;
            o.stats.scripts_offsite += child.stats.scripts_offsite;
            o.stats.iframes += child.stats.iframes;
            o.stats.iframes_offsite += child.stats.iframes_offsite;
            o.stats.images += child.stats.images;
            o.stats.beacons += child.stats.beacons;
        }

        // empty the network_path array and rebuild it
        network_path.splice (0, network_path.length)
        for (i = 0; i < old_network_path.length; i++)
        {
            network_path.push (old_network_path[i]);
        }
    }


    function postprocess_trees ()
    {
        for (var i = 0; i < _ad_objects.length; i++)
        {
            var ad_obj = _ad_objects[i];
            ad_obj.timer = 0;
            analyze_branch (ad_obj);
        }
    }

    function add_events ()
    {
        var sel = document.getElementById ('div-list');

        sel.addEventListener ('click', function (e)
        {

            var child = document.getElementById ("selected-tree-marker");
            if (child != null)
            {
                child.parentElement.removeChild (child);
            }

            // show the appropriate tree...
            for (var i = 0; i < _ad_objects.length; i++)
            {
                var i1 = i + 1;
                var div = document.getElementById ('ad-el-' + i1);

                if (typeof e.target.id === "undefined")
                {
                    e.target.id = 0;
                }

                if (i1 == e.target.id)
                {
                    div.className = "ad-el-tree selected";
                    document.getElementById("rabbit_" + i1).innerHTML += "<span id='selected-tree-marker'><img src='/icon128.png' style='width:30px;margin: 0px 8px;'></span>";

                    var label_elements = div.getElementsByTagName ('label');
                    if (label_elements.length > 0)
                    {
                        label_elements[0].click ();
                    }

                    chrome.tabs.sendMessage (_curr_tab_id,
                        {text: "scroll_into_view", idx: i},
                        {frameId: _root_frame_id});
                }
                else
                {
                    div.className = "ad-el-tree";
                }
            }

        });

        document.ondblclick = function(e)
        {
            var el = e.target;
            if (!el.className.match (/tree-node/) || el.className.match (/perf-bar-child/))
            {
                return;
            }

            var siblings = el.parentNode.childNodes;
            for(i = 0; i < siblings.length; i++){
                if(siblings[i].tagName === 'OL'){
                    siblings[i].style.display = window.getComputedStyle(siblings[i], null).getPropertyValue("display") == "block" ? "none" : "block";
                }
            }
        };

        document.onclick = function (e)
        {
            var el = e.target;
            if (!el.className.match (/tree-node/) || el.className.match (/perf-bar-child/))
            {
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

            var markup = "";

            markup += "<table class=\"desc\" style=\"width:100%;\">\n<tr><td><strong>tag</strong></td><td>" + o.tagname + "</td></tr>\n";

            if (o.id)
            {
                markup += "<tr><td><strong>id:</strong></td><td>" + o.id + "</td></tr>\n";
            }
            if (o.class)
            {
                markup += "<tr><td><strong>class:</strong></td><td>" + o.class + "</td></tr>\n";
            }

            var img_src = null;
            if (typeof o.background_image !== 'undefined')
            {
                markup += "<tr><td><strong>backgroundImage:</strong></td><td>" + o.background_image + "</td></tr>\n";
                var bg = o.background_image;
                bg = bg.replace (/^url\("(.*)"\)$/, '$1');
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

                var enc_url = url.replace (/[\u00A0-\u9999<>\&]/gim, function (i)
                {
                    return '&#' + i.charCodeAt (0) + ';';
                });
                var enc_url_short = url_short.replace (/[\u00A0-\u9999<>\&]/gim, function (i)
                {
                    return '&#' + i.charCodeAt (0) + ';';
                });
                markup += "<tr><td><strong>href:</strong></td><td><a href=\"" + enc_url
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

                var enc_url = url.replace (/[\u00A0-\u9999<>\&]/gim, function (i)
                {
                    return '&#' + i.charCodeAt (0) + ';';
                });
                var enc_url_short = url_short.replace (/[\u00A0-\u9999<>\&]/gim, function (i)
                {
                    return '&#' + i.charCodeAt (0) + ';';
                });
                markup += "<tr><td><strong>src:</strong></td><td><a href=\"" + enc_url
                    + "\">" + "link" + "</a></td></tr>\n";

                if (o.tagname === 'img')
                {
                    img_src = url;
                }
            }

            var img = document.getElementById ('img-detail-image');
            if (img_src === null)
            {
                img.style.display = 'none';
            }
            else
            {
                img.style.display = 'block';
                img.src = img_src;
            }

            if (typeof o.width !== 'undefined')
            {
                markup += "<tr><td><strong>width:</strong></td><td>" + o.width + "</td></tr>\n";
            }

            if (typeof o.height !== 'undefined')
            {
                markup += "<tr><td><strong>height:</strong></td><td>" + o.height + "</td></tr>\n";
            }


            if (o.network_path)
            {
                markup += "<tr><td><strong>network path:</strong></td><td>";
                var network_path_array = o.network_path.split(",");
                console.log(network_path_array);
                for( k = 0; k < network_path_array.length; k++){
                    console.log(network_path_array[k]);
                    markup += "<span>" + network_path_array[k] + "</span><br>";
                }

            }

            if (typeof o.is_beacon !== 'undefined')
            {
                var val = (o.is_beacon) ? 'yes' : 'no';
                markup += "<tr><td><strong>is beacon:</strong></td><td>" + val + "</td></tr>\n";
            }

            var stats = [];
            if (o.stats.scripts > 0)
            {
                var offsite = "";
                if (o.stats.scripts_offsite > 0)
                {
                    offsite += " (" + o.stats.scripts_offsite + " offsite)";
                }

                var stat = "<tr><td><strong>scripts:</strong></td><td>" + o.stats.scripts + offsite + "</td></tr>\n";
                stats.push (stat);
            }
            if (o.stats.iframes > 0)
            {
                var frame = "";
                if (o.stats.iframes_offsite > 0)
                {
                    frame = " (" + o.stats.iframes_offsite + " offsite)";
                }
                var stat =  "<tr><td><strong>iframes:</strong></td><td>" + o.stats.iframes + frame + "</td>";
                stats.push (stat);
            }
            if (o.stats.images > 0)
            {
                var images =  "<tr><td><strong>images:</strong></td><td>" + o.stats.images  + "</td>";
                stats.push (images);
            }
            if (o.stats.beacons > 0)
            {
                var images =  "<tr><td><strong>beacons:</strong></td><td>" + o.stats.beacons  + "</td>";
                stats.push (images);
            }

            if (stats.length > 0)
            {
                markup += "<tr><td colspan='2' ><h4>Stats</h4></td></tr>";
                markup += stats.join ("\n");
            }

            if (o.performance.loadStart > 0)
            {
                markup += "<tr><td colspan='2' ><h4>Performance</h4></td></tr>";
                markup += "<tr><td><strong>start time:</strong></td><td>" + toFullLocaleTimeString (o.performance.loadStart) + "</td></tr>\n";
                markup += "<tr><td><strong>end time:</strong></td><td>" + toFullLocaleTimeString (o.performance.loadStart) + "</td></tr>\n";
                markup += "<tr><td><strong>Time (rel):</strong></td><td>" + Math.round (o.performance.duration) + " ms" + "</td></tr>\n";
                markup += "<tr><td><strong>Time (abs):</strong></td><td>" + Math.round ((o.performance.loadStart - _load_page_start) + o.performance.duration) + " ms" + "</td></tr>\n";
            }

            markup += "</table>\n";

            var div = document.getElementById ('div-detail-desc');
            div.innerHTML = markup;

            var aTags = document.getElementsByTagName ('a');
            for (i = 0; i < aTags.length; i++)
            {
                aTags[i].addEventListener ('click', function (event)
                {
                    event.preventDefault ();
                    chrome.windows.create ({"url": enc_url})
                });
            }

        };

    }

    function toFullLocaleTimeString (d)
    {
        var date = new Date (d);
        return pad (date.getHours ()) + ":" + pad (date.getMinutes ()) + ":" + pad (date.getSeconds ()) + "." + date.getMilliseconds ();
    }

    function pad (n)
    {
        return (n < 10) ? ("0" + n) : n;
    }

    function render ()
    {
        if (typeof _ad_objects === 'undefined')
        {
            return false;
        }
        // merge in the iframe information and analyze the trees
        postprocess_trees ();

        var div_list = document.getElementById ('div-list');
        var div_text = document.getElementById ('div-detail-text');
        if (_ad_objects.length == 0)
        {
            div_list.innerHTML = "<p>no ad elements found</p></div></div>\n";
            return;
        }

        div_list.innerHTML = "";

        var tree_markup = '';
        var css_selector = _css_selector//.replace(/(\[id\*=')|('])/g,'');

        _nodecount = 0;
        _node_data = [];

        for (var i = 0; i < _ad_objects.length; i++)
        {
            var ad_obj = _ad_objects[i];
            var timer = (ad_obj.performance.duration > 0)
                ? Math.round (ad_obj.performance.loadStart + ad_obj.performance.duration - _load_page_start)
                : 0;

            var i1 = i + 1;
            div_list.innerHTML += '<div class="perf-bar" ><div id="rabbit_' + i1 + '" class="perf-bar-child-select"></div><span id="' + i1 + '" class="perf-bar-child" >'
                + ad_obj.id.replace (css_selector, '')
                + ' ' + timer + 'ms'
                + '</span><span style="display: none" >'
                + timer
                + 'ms</span></div>';

            if (timer > _longest_duration)
            {
                _longest_duration = timer;
            }

            tree_markup += '<div class="ad-el-tree" id="ad-el-' + i1 + '"><ol class="tree">';
            tree_markup += render_branch (ad_obj);
            tree_markup += '</ol></div>';
        }

        div_text.innerHTML = tree_markup;
        post_render ();
        add_events ();

        //hacky way of getting the details window to fit
        var top_val = document.getElementById('div-list').getBoundingClientRect().bottom;
        document.getElementById('div-detail').style.top = top_val + "px";
    }

    function post_render ()
    {
        var perf_bars = document.getElementsByClassName ('perf-bar');
        var max_width = "750px";

        for (var i = 0; i < perf_bars.length; i++)
        {
            var perf_bar = perf_bars[i];
            var perf_bar_child_rabbit_space = perf_bar.children[0];
            var perf_bar_child_bar = perf_bar.children[1];
            var perf_bar_child_timer = perf_bar.children[2];

            var timer = parseInt (perf_bar_child_timer.innerHTML);

            if (timer == 0)
            {
                perf_bar_child_bar.style.width = max_width;
                perf_bar_child_bar.style.display = "none";
                perf_bar_child_rabbit_space.style.display = "none";
                perf_bar_child_bar.style.backgroundColor = "#ebebeb";
                perf_bar.removeChild (perf_bar_child_timer);
                continue;
            }

            var calculated_length = Math.floor ((timer * 750) / (_longest_duration + 1000));
            perf_bar_child_bar.style.width = calculated_length + "px";

            if (timer > 4000)
            {
                perf_bar_child_bar.style.backgroundColor = "#da5252";
            }
            else if (timer > 2000)
            {
                perf_bar_child_bar.style.backgroundColor = "#fdae61";
            }

        }
    }

    function scan_frame_callback (el)
    {
        _num_callbacks_received++;
        if (typeof el !== 'undefined')
        {
            console.log ('[scan_frame_callback] callback received for ' + el.frame.rhFrameId);
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

    function start ()
    {
        console.log ("[popup] start()...");

        chrome.tabs.executeScript (
            _curr_tab_id,
            {code: 'var x = performance.timing.navigationStart; x'},
            function (r)
            {
                _load_page_start = r[0];

                var s = new Date (_load_page_start)
                document.getElementById ('load_page_start').innerHTML = "Navigation Start Time: " + toFullLocaleTimeString (s);
            }
        );

        chrome.storage.sync.get ({
            css_selector: "[id*='my-ad-idbase-']"
        }, function (items)
        {
            //  console.info(items);
            _css_selector = items.css_selector;
            start_scan ();
        });
    }

    function start_scan ()
    {
        _num_callbacks_received = 0;
        console.log ("scanning all frames...");
        chrome.webNavigation.getAllFrames ({tabId: _curr_tab_id}, function (details)
        {
            message_details = [];
            details.forEach (function (frame)
            {
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

                chrome.tabs.sendMessage (_curr_tab_id, deets,
                    {frameId: deets.frameId}, callback);
            }
        });
    }

    function run ()
    {
        document.addEventListener ('DOMContentLoaded', function ()
        {
            document.querySelector ('#go-to-options').addEventListener ('click', function (event)
            {
                event.preventDefault ();
                if (chrome.runtime.openOptionsPage)
                {
                    // New way to open options pages, if supported (Chrome 42+).
                    chrome.runtime.openOptionsPage ();
                }
                else
                {
                    // Reasonable fallback.
                    window.open (chrome.runtime.getURL ('options.html'));
                }
            });

            var bg = chrome.extension.getBackgroundPage();
            _curr_tab_id = bg.curr_tab_id;
            console.log ("_curr_tab_id: " + _curr_tab_id);

            console.log ("starting page scan...");
            start ();
        });
    }

    return {
        run: run
    };
}


var p = new rh_popup();
p.run ();

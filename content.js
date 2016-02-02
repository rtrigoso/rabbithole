var _last_highlighted_el = null;
var _last_highlighted_el_border = '';

var _ad_elements = [];

function check_iframe_access (iframe) 
{
    try {
        var doc = iframe.contentDocument || iframe.contentWindow.document;
        var origClass = doc.body.className;
        var newClass = origClass += " xxxxx";
        doc.body.className = newClass;
        var valid = doc.body.className == newClass;
        doc.body.className = origClass;
        return(valid);
    } 
    catch(e) {
        return(false);
    }
}



function create_el_data (el)
{
    var tagname = "";
    var id = "";
    var cname = "";

    if (typeof el.tagName === 'string')
    {
        tagname = el.tagName.toLowerCase ();
    }
    if (typeof el.id === 'string')
    {
        id = el.id;
    }
    if (typeof el.className === 'string')
    {
        cname = el.className;
    }
    var o = {
        tagname: tagname,
        id: id,
        class: cname,
        children: []
    };

    return o;
}

function descend_log (o, depth)
{
    var msg = '';
    for (var i = 0; i < depth; i++)
    {
        msg = "  " + msg;
    }

    msg += "<" + o.tagname + " id=\"" + o.id + "\"";
    if (typeof o.src !== 'undefined')
    {
        msg += " src=\"" + o.src + "\"";
    }
    if (typeof o.href !== 'undefined')
    {
        msg += " href=\"" + o.href + "\"";
    }
    msg += ">";

    console.log (msg);
}

function descend (el, o, depth)
{
    if (typeof depth === 'undefined')
    {
        depth = 0;
    }

    var children = el.childNodes;

    if (!children)
    {
        console.log ('%celement ' + el.tagName + ' has null childNodes list.', 'font-style: italic');
        return;
        
    }

    if (typeof children.length === 'undefined')
    {
        console.log ('%celement ' + el.tagName + ' has empty childNodes list.', 'font-style: italic');
        return;
    }

    for (var i = 0; i < children.length; i++)
    {
        var child = children[i];

        var o2 = create_el_data (child);

        var descend_el = child;
        var keep_child = true;
        switch (o2.tagname)
        {
            case 'div':
                break;

            case 'canvas':
                break;

            case 'form':
                // some interactive ads have forms
                break;

            case 'iframe':
                o2.src = child.getAttribute ('src');
                if (!o2.src)
                {
                    o2.src = "";
                }

                if (!check_iframe_access (child))
                {
                    o2.iframe_denied = true;
                    //console.log ("%cDenied access to iframe", "color:red;font-weight:bold");
                    descend_el = null;
                    break;
                }
                var innerDoc = child.contentDocument || child.contentWindow.document;
                //var body = innerDoc.getElementsByTagName("body").item(0);
                //descend_el = body;
                descend_el = innerDoc.documentElement;
                break;

            case 'script':
                o2.src = child.getAttribute ('src');
                if (!o2.src)
                {
                    o2.src = "";
                }
                break;

            case 'a':
                o2.href = child.getAttribute ('href');
                if (!o2.href)
                {
                    o2.href = "";
                }
                break;

            case 'img':
                o2.src = child.getAttribute ('src');
                if (!o2.src)
                {
                    o2.src = "";
                }
                o2.width = child.width;
                o2.height = child.height;
                break;

            case '':
                continue;

            default:
                // "compress" the tree by not tracking tags we don't care about
                descend_o = o;
                keep_child = false;
        }

        if (child.style && child.style.backgroundImage)
        {
            o2.background_image = child.style.backgroundImage;
        }

        descend_log (o2, depth);

        if (keep_child)
        {
            o.children.push (o2);
        }

        if (descend_el !== null)
        {
            descend (descend_el, (keep_child ? o2 : o), depth + 1);
        }
    }
}

function scan_page (request, callback)
{
    var ad_objects = [];

    console.log ("[scan_page] scanning for elements matching " + request.selector);

    _ad_elements = document.querySelectorAll (request.selector);

    if (typeof _ad_elements.length === 'undefined')
    {
        callback (ad_objects);
        return;
    }

    for (var i = 0; i < _ad_elements.length; i++)
    {
        var ad_el = _ad_elements[i];
        console.log ("%c[scan_page] ad element " + ad_el.getAttribute('id'), 'font-weight: bold');

        var o = create_el_data (ad_el);
        ad_objects.push (o);
        descend (ad_el, o);
    }

    console.log ("[scan_page] calling callback with array of " + ad_objects.length + " items");

    // Call the specified callback, passing
    // the web-page's DOM content as argument
    callback (ad_objects);
}

function scan_frame (request, callback)
{
    console.log ("[scan_frame] scanning frame...");
    var doc = document.documentElement;
    var o = create_el_data (doc);
    descend (doc, o);
    o.frame = {
        frameId: request.frameId,
        parentFrameId: request.parentFrameId,
        url: request.url
    };
    //console.log ("calling scan_frame callback with o: " + JSON.stringify (o.frame));
    console.log ("calling scan_frame callback with o: " + JSON.stringify (o));
    callback (o);
}

function scroll_into_view (request)
{
    if (typeof request.idx === 'undefined')
    {
        return;
    }

    if (typeof _ad_elements.length === 'undefined')
    {
        return;
    }

    if ((request.idx < 0) || (request.idx > _ad_elements.length - 1))
    {
        return;
    }

    var el = _ad_elements[request.idx];

    if (_last_highlighted_el !== null)
    {
        console.log ("restoring border style of last highlighted el to '" + _last_highlighted_el_border + "'...");
        _last_highlighted_el.style.border = _last_highlighted_el_border;
    }

    _last_highlighted_el = el;
    _last_highlighted_el_border = "" + el.style.border;

    console.log ("putting green border around element...");
    el.style.border = "5px solid lightgreen";

    el.scrollIntoView ({
        behavior: "smooth",
        block: "start"
    });
}


// Listen for messages
chrome.runtime.onMessage.addListener(function (request, sender, callback) {
    // If the received message has the expected format...
    switch (request.text)
    {
        case 'scan_page':
            console.log ("scan_page message received...");
            scan_page (request, callback);
            break;

        case 'scan_frame':
            console.log ("scan_frame message received by frame " + request.frameId + "...");
            scan_frame (request, callback);
            break;

        case 'scroll_into_view':
            console.log ("scroll_into_view message received...");
            scroll_into_view (request);
            break;
    }
});

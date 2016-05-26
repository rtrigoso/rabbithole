/* debugging variable */
var debug = 0;
/* ****************** */

var _last_highlighted_el = null;
var _last_highlighted_el_border = '';

var _ad_elements = [];
var _performance_obj = [];
var _loaded = 0;

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
      children: [],
      duration: 0,
      startTime: 0
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
      var url = o.href;
  }
  if (typeof o.href !== 'undefined')
  {
      msg += " href=\"" + o.href + "\"";
      var url = o.href;
  }
  msg += ">";

    // console.log (msg);
}

function descend (el, o, depth, page)
{

  if (typeof depth === 'undefined')
  {
      depth = 0;
  }

  if (typeof page === 'undefined')
  {
      page = "neither";
  }

  var children = el.childNodes;

  if (!children)
  {
      return;
  }

  if (typeof children.length === 'undefined')
  {
      return;
  }

  for (var i = 0; i < children.length; i++)
  {
        var child = children[i];
        var url = "";
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
                break;

            case 'iframe':
                o2.src = url = child.src;
                if (!o2.src)
                {
                    o2.src = "";
                }

                if (!check_iframe_access (child))
                {
                    o2.iframe_denied = true;
                    descend_el = null;
                    break;
                }
                var innerDoc = child.contentDocument || child.contentWindow.document;
                descend_el = innerDoc.documentElement;
                break;

            case 'script':
                o2.src = url = child.src;
                if (!o2.src)
                {
                    o2.src = "";
                }
                break;

            case 'a':
                o2.href = url = child.href;
                if (!o2.href)
                {
                    o2.href = "";
                }
                break;

            case 'img':
                o2.src = child.src;
                url = child.src;
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
                // descend_o = o;
                keep_child = false;
        }

        if ( url != "" ) {
            var entry = performance.getEntriesByName(url)[0];
            if ( entry ) {
                o2.duration = entry.duration;
                o2.startTime = entry.startTime === 0 ? entry.fetchStart : entry.startTime;
                // _performance_obj[url] = {
                //   "duration": o2.duration,
                //   "startTime": o2.startTime
                // };

                if(o.id == "aw0"){
                  console.log(o2);
                  console.log(keep_child);
                  console.log(page);
                  // console.info(_performance_obj);
                }
            }
        }

        if (child.style && child.style.backgroundImage)
        {
            o2.background_image = child.style.backgroundImage;
        }

        //descend_log (o2, depth);

        if (keep_child)
        {
            o.children.push (o2);
        }

        if (descend_el !== null)
        {
            descend (descend_el, (keep_child ? o2 : o), depth + 1, page);
        }
    }
}

function scan_page (request, callback)
{
  console.log("scanning page...");
  var ad_objects = [];

  _ad_elements = document.querySelectorAll (request.selector);

  if (typeof _ad_elements.length === 'undefined')
  {
      callback (ad_objects);
      return;
  }

  for (var i = 0; i < _ad_elements.length; i++)
  {
      var ad_el = _ad_elements[i];
      var o = create_el_data (ad_el);
      descend (ad_el, o, 0, "scan_page");
      ad_objects.push (o);
  }

  callback (ad_objects);
  return false;
}

function scan_frame (request, callback)
{
  console.log("scanning frame..." + request.frameId);
  var doc = document.documentElement;
  var o = create_el_data (doc);
  descend (doc, o, 0, o);
  o.frame = {
      frameId: request.frameId,
      parentFrameId: request.parentFrameId,
      url: request.url
  };
  callback (o);
  return false;
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
    // console.log ("restoring border style of last highlighted el to '" + _last_highlighted_el_border + "'...");
      _last_highlighted_el.style.border = _last_highlighted_el_border;
  }

  _last_highlighted_el = el;
  _last_highlighted_el_border = "" + el.style.border;

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
          // console.log ("scan_page message received...");
            scan_page (request, callback);
            break;

        case 'scan_frame':
          // console.log ("scan_frame message received by frame " + request.frameId + "...");
            scan_frame (request, callback);
            break;

        case 'scroll_into_view':
          // console.log ("scroll_into_view message received...");
            scroll_into_view (request);
            break;
    }

});

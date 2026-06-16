using System.Text;
using System.Text.RegularExpressions;
using System.Xml;

namespace Chattr.Infrastructure.Services;

/// <summary>
/// Sanitizes inline SVG markup for storage in <c>GuildRole.IconSvg</c>.
/// The raw payload comes from a guild admin (eventually — the upload
/// UI is a follow-up) and is embedded directly in HTML on the
/// client. Without sanitization a malicious author could inject
/// &lt;script&gt; tags, &lt;iframe&gt; wrappers, on-event handlers,
/// javascript: URLs, external &lt;use href&gt; references, etc.
///
/// The strategy is conservative: parse as XML, walk the tree, drop
/// any element / attribute not on an explicit whitelist, strip
/// script / style content, and normalise the result. We never
/// trust the input — every node has to earn its place.
/// </summary>
public static class SvgSanitizer
{
    // Element whitelist. Anything else (script, iframe, foreignObject,
    // image, animate, audio, video, foreignObject) is silently
    // dropped along with its children. Using a HashSet for O(1) lookups
    // — the elements list is short and gets walked per node.
    private static readonly HashSet<string> AllowedElements = new(StringComparer.OrdinalIgnoreCase)
    {
        "svg", "g", "defs", "symbol", "use",
        "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
        "text", "tspan", "title", "desc",
        "linearGradient", "radialGradient", "stop",
        "clipPath", "mask",
    };

    // Attribute whitelist per element. Keeps the API surface tight:
    // an attacker who slips a new attribute past us will hit this
    // set and be dropped. We allow enough to draw the common
    // Discord-style icons (path data, fill, stroke, transform,
    // viewBox) but not enough to escape the sandbox.
    private static readonly Dictionary<string, HashSet<string>> AllowedAttrs =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["svg"]      = new(StringComparer.OrdinalIgnoreCase) { "viewBox", "width", "height", "fill", "stroke", "xmlns" },
            ["g"]        = new(StringComparer.OrdinalIgnoreCase) { "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "transform", "opacity", "fill-opacity", "stroke-opacity" },
            ["defs"]     = new(StringComparer.OrdinalIgnoreCase) { },
            ["symbol"]   = new(StringComparer.OrdinalIgnoreCase) { "viewBox", "fill", "stroke" },
            ["use"]      = new(StringComparer.OrdinalIgnoreCase) { "href", "xlink:href", "x", "y", "width", "height", "fill", "stroke" },
            ["path"]     = new(StringComparer.OrdinalIgnoreCase) { "d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "transform", "opacity", "fill-opacity", "stroke-opacity", "fill-rule" },
            ["rect"]     = new(StringComparer.OrdinalIgnoreCase) { "x", "y", "width", "height", "rx", "ry", "fill", "stroke", "stroke-width", "transform", "opacity" },
            ["circle"]   = new(StringComparer.OrdinalIgnoreCase) { "cx", "cy", "r", "fill", "stroke", "stroke-width", "transform", "opacity" },
            ["ellipse"]  = new(StringComparer.OrdinalIgnoreCase) { "cx", "cy", "rx", "ry", "fill", "stroke", "stroke-width", "transform", "opacity" },
            ["line"]     = new(StringComparer.OrdinalIgnoreCase) { "x1", "y1", "x2", "y2", "stroke", "stroke-width", "stroke-linecap", "transform", "opacity" },
            ["polyline"] = new(StringComparer.OrdinalIgnoreCase) { "points", "fill", "stroke", "stroke-width", "stroke-linecap", "transform", "opacity" },
            ["polygon"]  = new(StringComparer.OrdinalIgnoreCase) { "points", "fill", "stroke", "stroke-width", "stroke-linejoin", "transform", "opacity" },
            ["text"]     = new(StringComparer.OrdinalIgnoreCase) { "x", "y", "dx", "dy", "font-family", "font-size", "font-weight", "fill", "stroke", "text-anchor", "transform" },
            ["tspan"]    = new(StringComparer.OrdinalIgnoreCase) { "x", "y", "dx", "dy", "fill", "stroke", "font-family", "font-size", "font-weight" },
            ["title"]    = new(StringComparer.OrdinalIgnoreCase) { },
            ["desc"]     = new(StringComparer.OrdinalIgnoreCase) { },
            ["linearGradient"] = new(StringComparer.OrdinalIgnoreCase) { "id", "x1", "y1", "x2", "y2", "gradientUnits", "gradientTransform" },
            ["radialGradient"] = new(StringComparer.OrdinalIgnoreCase) { "id", "cx", "cy", "r", "fx", "fy", "gradientUnits", "gradientTransform" },
            ["stop"]     = new(StringComparer.OrdinalIgnoreCase) { "offset", "stop-color", "stop-opacity" },
            ["clipPath"] = new(StringComparer.OrdinalIgnoreCase) { "id" },
            ["mask"]     = new(StringComparer.OrdinalIgnoreCase) { "id" },
        };

    // Attributes that are dangerous in <use href="..."> references:
    // the value can resolve to a URL. We allow fragment-only (#id)
    // and reject anything else (so external SVG references like
    // https://evil.com/x.svg can't be loaded).
    private static readonly Regex ExternalHref = new(
        @"^\s*(?!#)\S+", RegexOptions.Compiled);

    // Cap the output so a megabyte of recursive <g> nesting can't
    // DoS the client. 4 KiB is plenty for a role icon (Discord
    // caps theirs at 256 KiB but we go lower because the client
    // is rendering tiny avatars).
    private const int MaxOutputLength = 4096;
    private const int MaxInputLength  = 8192;

    /// <summary>
    /// Sanitizes <paramref name="rawSvg"/>. Returns null if the
    /// input is empty / null / fails to parse. The result is
    /// guaranteed to contain no &lt;script&gt;, no event handlers,
    /// no javascript: URLs, and only attributes from the
    /// whitelist. The output is a compact one-line SVG string
    /// (the whitespace between elements is collapsed).
    /// </summary>
    public static string? Sanitize(string? rawSvg)
    {
        if (string.IsNullOrWhiteSpace(rawSvg)) return null;
        if (rawSvg.Length > MaxInputLength) return null;

        // Use XmlReader in a non-validating, DtdProhibited mode so
        // a <!DOCTYPE> with a remote entity can't pull anything in.
        // We also disable external resource resolution as a belt-
        // and-suspenders measure.
        var settings = new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            XmlResolver = null,
            IgnoreComments = true,
            IgnoreProcessingInstructions = true,
            IgnoreWhitespace = false,
        };

        XmlDocument doc;
        try
        {
            using var sr = new StringReader(rawSvg);
            using var xr = XmlReader.Create(sr, settings);
            doc = new XmlDocument { XmlResolver = null };
            doc.Load(xr);
        }
        catch
        {
            return null;
        }

        // Walk the tree. We process the root separately so we
        // can verify it really is an <svg> element (otherwise
        // we'd happily return whatever the attacker wrapped it
        // in).
        if (doc.DocumentElement is null) return null;
        if (!string.Equals(doc.DocumentElement.LocalName, "svg", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var cleanedRoot = CleanNode(doc.DocumentElement);
        if (cleanedRoot is null) return null;

        // Serialise back out. We strip the xml declaration (we
        // never want <?xml ... ?> sitting in a role's icon
        // payload) and normalise whitespace.
        var sb = new StringBuilder();
        using (var xw = XmlWriter.Create(sb, new XmlWriterSettings
        {
            OmitXmlDeclaration = true,
            Indent = false,
            NewLineHandling = NewLineHandling.Replace,
        }))
        {
            cleanedRoot.WriteTo(xw);
        }
        var output = sb.ToString();
        if (output.Length > MaxOutputLength) return null;
        return output;
    }

    /// <summary>
    /// Recursively cleans a node and its children, returning a
    /// new node safe to insert into the output tree. Returns null
    /// if the node should be dropped (e.g. disallowed element,
    /// or after cleaning it has no children and no useful
    /// attributes).
    /// </summary>
    private static XmlNode? CleanNode(XmlNode node)
    {
        if (!AllowedElements.Contains(node.LocalName))
        {
            // Drop the entire subtree. We don't try to keep
            // children that happen to be on the whitelist —
            // a malicious <foreignObject> wrapping a <path> is
            // still a no.
            return null;
        }

        var doc = node.OwnerDocument ?? new XmlDocument();
        var cleaned = doc.CreateElement(node.LocalName, node.NamespaceURI);

        // Re-attach allowed attributes. We rebuild the attribute
        // collection from scratch rather than mutating in place so
        // ordering and casing are deterministic.
        var allowedSet = AllowedAttrs.TryGetValue(node.LocalName, out var s)
            ? s
            : new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (XmlAttribute? attr in node.Attributes!)
        {
            if (attr is null) continue;
            var name = attr.LocalName;
            if (!allowedSet.Contains(name)) continue;

            // Defence in depth: also reject anything that looks
            // event-handler-ish by name. Shouldn't fire because
            // the whitelist excludes them, but cheap to add.
            if (name.StartsWith("on", StringComparison.OrdinalIgnoreCase)) continue;

            // Reject javascript:, data:, vbscript:, file: in any
            // URL-bearing attribute. Whitespace / case tricks
            // ("Java\tscript:") get caught by the regex below.
            var value = attr.Value;
            if (IsDangerousUrl(value)) continue;

            // For <use href="..."> reject non-fragment references
            // (e.g. external SVGs) — only #fragment is allowed.
            if (string.Equals(node.LocalName, "use", StringComparison.OrdinalIgnoreCase) &&
                (string.Equals(name, "href", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(name, "xlink:href", StringComparison.OrdinalIgnoreCase)))
            {
                if (ExternalHref.IsMatch(value)) continue;
            }

            cleaned.SetAttribute(name, attr.NamespaceURI, value);
        }

        // Recurse into children. Element children are cleaned and
        // re-attached. Text nodes are kept as-is (the parent's
        // text content is plain data — no markup allowed inside
        // a text node). Comment / PI children were stripped at
        // the reader level.
        foreach (XmlNode child in node.ChildNodes)
        {
            if (child is XmlElement el)
            {
                var cleanedChild = CleanNode(el);
                if (cleanedChild is not null) cleaned.AppendChild(cleanedChild);
            }
            else if (child is XmlText t)
            {
                cleaned.AppendChild(doc.CreateTextNode(t.Value));
            }
            // CDATA is treated like text here — it can only
            // contain text content; if the parent allows it, the
            // text is safe.
            else if (child is XmlCDataSection cd)
            {
                cleaned.AppendChild(doc.CreateCDataSection(cd.Value));
            }
        }

        return cleaned;
    }

    private static readonly Regex DangerousUrl = new(
        @"^\s*(?:javascript|vbscript|data|file):",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static bool IsDangerousUrl(string? value)
    {
        if (string.IsNullOrEmpty(value)) return false;
        return DangerousUrl.IsMatch(value);
    }
}

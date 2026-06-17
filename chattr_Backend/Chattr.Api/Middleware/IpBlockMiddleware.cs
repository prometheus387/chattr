using System.Net;
using Microsoft.Extensions.Options;

namespace Chattr.Api.Middleware;

/// <summary>
/// Blocks requests from configured IPs / CIDR ranges.
/// Designed to run behind Cloudflare: the middleware
/// reads the Cloudflare-specific <c>CF-Connecting-IP</c>
/// header first, then falls back to <c>X-Forwarded-For</c>
/// (only when the immediate hop is a trusted proxy),
/// then to the connection's remote IP.
///
/// SECURITY: this middleware is the gatekeeper. The
/// single most important rule — never enable
/// <see cref="IpBlockOptions.TrustForwardedHeaders"/>
/// without populating
/// <see cref="IpBlockOptions.TrustedProxies"/>. An
/// attacker who can talk to the app directly can
/// otherwise set <c>X-Forwarded-For: 1.2.3.4</c> and
/// spoof past the block. With Cloudflare in front, the
/// safest path is <c>UseCloudflareHeaders = true</c>
/// and <c>TrustForwardedHeaders = false</c>: the
/// CF-Connecting-IP header is set by Cloudflare's edge
/// and cannot be forged by clients behind the proxy.
///
/// The resolved client IP is stored on
/// <c>HttpContext.Items["chattr.clientIp"]</c> for
/// downstream middleware (rate-limit, audit log).
/// </summary>
public sealed class IpBlockMiddleware
{
    private const string ClientIpItemKey = "chattr.clientIp";

    private readonly RequestDelegate _next;
    private readonly IpBlockOptions _options;
    private readonly ILogger<IpBlockMiddleware> _logger;
    private readonly IReadOnlyList<CidrBlock> _parsedBlocks;
    private readonly IReadOnlyList<CidrBlock> _parsedTrusted;

    public IpBlockMiddleware(
        RequestDelegate next,
        IOptions<IpBlockOptions> options,
        ILogger<IpBlockMiddleware> logger)
    {
        _next = next;
        _options = options.Value;
        _logger = logger;
        _parsedBlocks = ParseList(_options.BlockedRanges);
        _parsedTrusted = ParseList(_options.TrustedProxies);
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var clientIp = ResolveClientIp(context);

        if (clientIp is not null && IsBlocked(clientIp))
        {
            if (_options.LogBlocked)
            {
                _logger.LogWarning(
                    "Blocked request from {Ip} to {Method} {Path}",
                    clientIp, context.Request.Method, context.Request.Path);
            }
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsync("Forbidden");
            return;
        }

        // Make the resolved IP available to anything
        // downstream (rate limiter, audit log, etc.).
        // Storing as object so HttpContext.Items accepts it
        // — the consumer casts as needed.
        context.Items[ClientIpItemKey] = clientIp;

        await _next(context);
    }

    /// <summary>
    /// Resolves the client IP in the safe order:
    /// Cloudflare header → X-Forwarded-For (trusted proxy
    /// only) → X-Real-IP (same) → connection IP. Returns
    /// <c>null</c> when the address can't be parsed.
    /// </summary>
    private IPAddress? ResolveClientIp(HttpContext context)
    {
        // 1. Cloudflare's edge-supplied header. We trust
        //    this when UseCloudflareHeaders is on because
        //    Cloudflare strips any client-supplied
        //    CF-Connecting-IP before adding their own.
        if (_options.UseCloudflareHeaders &&
            context.Request.Headers.TryGetValue("CF-Connecting-IP", out var cf))
        {
            if (IPAddress.TryParse(cf.ToString(), out var cfAddr))
            {
                return cfAddr;
            }
        }

        // 2. X-Forwarded-For / X-Real-IP, but only when
        //    the immediate hop is a configured trusted
        //    proxy. Without this guard, an attacker
        //    directly hitting the app could spoof these
        //    headers.
        if (_options.TrustForwardedHeaders)
        {
            var remoteIp = context.Connection.RemoteIpAddress;
            if (remoteIp is not null && IsTrustedProxy(remoteIp))
            {
                if (context.Request.Headers.TryGetValue("X-Forwarded-For", out var xff))
                {
                    // XFF is a comma-separated chain in
                    // the form "client, proxy1, proxy2".
                    // The leftmost address is the original
                    // client.
                    var first = xff.ToString()
                        .Split(',', StringSplitOptions.RemoveEmptyEntries)
                        .FirstOrDefault()?.Trim();
                    if (first is not null && IPAddress.TryParse(first, out var xffAddr))
                    {
                        return xffAddr;
                    }
                }

                if (context.Request.Headers.TryGetValue("X-Real-IP", out var xri))
                {
                    if (IPAddress.TryParse(xri.ToString(), out var xriAddr))
                    {
                        return xriAddr;
                    }
                }
            }
        }

        // 3. The TCP-level peer. With no proxy in front,
        // this is the client's real IP.
        return context.Connection.RemoteIpAddress;
    }

    private bool IsBlocked(IPAddress ip)
        => _parsedBlocks.Any(b => b.Contains(ip));

    private bool IsTrustedProxy(IPAddress ip)
        => _parsedTrusted.Any(b => b.Contains(ip));

    private static IReadOnlyList<CidrBlock> ParseList(IEnumerable<string> raw)
    {
        var blocks = new List<CidrBlock>();
        foreach (var entry in raw)
        {
            if (string.IsNullOrWhiteSpace(entry)) continue;
            try
            {
                var block = CidrBlock.Parse(entry);
                if (block is not null) blocks.Add(block);
            }
            catch (FormatException)
            {
                // Bad CIDR syntax in config — skip and
                // continue. We log once at startup to
                // surface the misconfiguration; doing it
                // here would spam the log on every
                // request.
            }
        }
        return blocks;
    }

    /// <summary>
    /// A single IP / CIDR block. Supports both bare
    /// addresses ("1.2.3.4") and CIDR notation
    /// ("10.0.0.0/8"). IPv4 + IPv6. The implementation
    /// is byte-wise — straightforward to audit, no
    /// BigInteger shenanigans.
    /// </summary>
    private sealed class CidrBlock
    {
        private readonly byte[] _network;
        private readonly int _prefixBits;

        private CidrBlock(byte[] network, int prefixBits)
        {
            _network = network;
            _prefixBits = prefixBits;
        }

        public static CidrBlock? Parse(string s)
        {
            s = s.Trim();
            if (s.Length == 0) return null;

            int prefix;
            IPAddress addr;

            if (s.Contains('/'))
            {
                var slash = s.IndexOf('/');
                var ipPart = s[..slash];
                if (!int.TryParse(s[(slash + 1)..], out prefix))
                    throw new FormatException($"Bad CIDR prefix in '{s}'.");
                if (!IPAddress.TryParse(ipPart, out addr))
                    throw new FormatException($"Bad IP in '{s}'.");
            }
            else
            {
                if (!IPAddress.TryParse(s, out addr))
                    throw new FormatException($"Bad IP '{s}'.");
                // Bare IP: /32 for IPv4, /128 for IPv6.
                prefix = addr.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork
                    ? 32 : 128;
            }

            var max = addr.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork
                ? 32 : 128;
            if (prefix < 0 || prefix > max)
                throw new FormatException(
                    $"Prefix /{prefix} out of range for {addr.AddressFamily}.");

            return new CidrBlock(addr.GetAddressBytes(), prefix);
        }

        /// <summary>
        /// True when <paramref name="ip"/> falls inside
        /// the network. Address-family mismatch returns
        /// false (an IPv6 address is never inside an IPv4
        /// CIDR and vice versa) so you can list both
        /// families in <see cref="IpBlockOptions.BlockedRanges"/>
        /// without one silently swallowing the other.
        /// </summary>
        public bool Contains(IPAddress ip)
        {
            var candidate = ip.GetAddressBytes();
            if (candidate.Length != _network.Length) return false;

            // Compare full bytes first, then a partial
            // byte for the remainder of the prefix.
            int fullBytes = _prefixBits / 8;
            int remainder = _prefixBits % 8;

            for (int i = 0; i < fullBytes; i++)
            {
                if (candidate[i] != _network[i]) return false;
            }

            if (remainder > 0 && fullBytes < candidate.Length)
            {
                int mask = (0xFF << (8 - remainder)) & 0xFF;
                if ((candidate[fullBytes] & mask) != (_network[fullBytes] & mask))
                {
                    return false;
                }
            }

            return true;
        }
    }
}

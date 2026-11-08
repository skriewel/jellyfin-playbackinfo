using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.PlaybackInfo.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>Master switch for the client-side display.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Show the video codec (and profile / bit depth) next to the resolution.</summary>
    public bool ShowCodec { get; set; } = true;

    /// <summary>Show the dynamic range (HDR10, Dolby Vision, HLG) when it is not SDR.</summary>
    public bool ShowHdr { get; set; } = true;

    /// <summary>Show the bitrate of the stream that reaches the player.</summary>
    public bool ShowBitrate { get; set; } = true;

    /// <summary>Show the audio codec and channel layout.</summary>
    public bool ShowAudio { get; set; }

    /// <summary>While transcoding, also show the original resolution and codec ("4K HEVC → 1080p H.264").</summary>
    public bool ShowSource { get; set; } = true;

    /// <summary>While transcoding, show why the server transcodes (TranscodeReasons).</summary>
    public bool ShowReasons { get; set; } = true;

    /// <summary>Bumped on every save; used as script cache key.</summary>
    public long Revision { get; set; }
}

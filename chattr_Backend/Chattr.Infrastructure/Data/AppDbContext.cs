using Chattr.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users { get; set; }
    public DbSet<PlatformInvite> PlatformInvites { get; set; }
    public DbSet<SystemSetting> SystemSettings { get; set; }

    public DbSet<Guild> Guilds { get; set; }
    public DbSet<GuildMember> GuildMembers { get; set; }
    public DbSet<GuildRole> GuildRoles { get; set; }
    public DbSet<GuildInvite> GuildInvites { get; set; }

    public DbSet<Channel> Channels { get; set; }
    public DbSet<Message> Messages { get; set; }

    public DbSet<DmChannel> DmChannels { get; set; }
    public DbSet<DmMessage> DmMessages { get; set; }


    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ---- User ----
        modelBuilder.Entity<User>().HasIndex(u => u.Username).IsUnique();

        // ---- Guild / Member / Role ----
        modelBuilder.Entity<Guild>().HasIndex(g => g.Name);

        modelBuilder.Entity<GuildMember>()
            .HasOne(m => m.User).WithMany().HasForeignKey(m => m.UserId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<GuildMember>()
            .HasOne(m => m.Guild).WithMany(g => g.Members).HasForeignKey(m => m.GuildId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<GuildMember>()
            .HasIndex(m => new { m.UserId, m.GuildId }).IsUnique();

        // ---- GuildInvite ----
        modelBuilder.Entity<GuildInvite>().HasIndex(i => i.GuildId);
        modelBuilder.Entity<GuildInvite>()
            .HasOne(i => i.Guild).WithMany().HasForeignKey(i => i.GuildId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<GuildInvite>()
            .HasOne(i => i.IssuedBy).WithMany().HasForeignKey(i => i.IssuedById)
            .OnDelete(DeleteBehavior.Restrict);

        // ---- Channel ----
        modelBuilder.Entity<Channel>().HasIndex(c => new { c.GuildId, c.Position });
        modelBuilder.Entity<Channel>()
            .HasOne(c => c.Guild).WithMany().HasForeignKey(c => c.GuildId)
            .OnDelete(DeleteBehavior.Cascade);

        // ---- Message ----
        modelBuilder.Entity<Message>().HasIndex(m => new { m.ChannelId, m.CreatedAt });
        modelBuilder.Entity<Message>()
            .HasOne(m => m.Channel).WithMany().HasForeignKey(m => m.ChannelId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<Message>()
            .HasOne(m => m.Author).WithMany().HasForeignKey(m => m.AuthorId)
            .OnDelete(DeleteBehavior.Restrict);

        // ---- DmChannel / DmMessage ----
        // Composite unique on (UserA, UserB) — the canonical-order rule
        // (smaller id first) lets us dedupe without checking both orderings.
        modelBuilder.Entity<DmChannel>().HasIndex(d => new { d.UserAId, d.UserBId }).IsUnique();
        modelBuilder.Entity<DmChannel>().HasIndex(d => d.LastMessageAt);
        modelBuilder.Entity<DmChannel>()
            .HasOne(d => d.UserA).WithMany().HasForeignKey(d => d.UserAId)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<DmChannel>()
            .HasOne(d => d.UserB).WithMany().HasForeignKey(d => d.UserBId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<DmMessage>().HasIndex(m => new { m.DmChannelId, m.CreatedAt });
        modelBuilder.Entity<DmMessage>()
            .HasOne(m => m.DmChannel).WithMany().HasForeignKey(m => m.DmChannelId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<DmMessage>()
            .HasOne(m => m.Author).WithMany().HasForeignKey(m => m.AuthorId)
            .OnDelete(DeleteBehavior.Restrict);

        // ---- Platform-level tables ----
        modelBuilder.Entity<PlatformInvite>().HasIndex(p => p.Code).IsUnique();
        modelBuilder.Entity<SystemSetting>().HasKey(s => s.Key);
        modelBuilder.Entity<SystemSetting>().HasIndex(s => s.Key).IsUnique();
    }
}

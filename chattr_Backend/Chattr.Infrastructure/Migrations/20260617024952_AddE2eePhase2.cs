using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Chattr.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddE2eePhase2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "E2eeChannels",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    CreatedByUserId = table.Column<int>(type: "integer", nullable: false),
                    IsEphemeral = table.Column<bool>(type: "boolean", nullable: false),
                    RotationInterval = table.Column<string>(type: "text", nullable: false),
                    NextRotationUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ClearOnRotation = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_E2eeChannels", x => x.Id);
                    table.ForeignKey(
                        name: "FK_E2eeChannels_Users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "UserPgpKeys",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    PublicKeyArmored = table.Column<string>(type: "text", nullable: false),
                    Fingerprint = table.Column<string>(type: "text", nullable: false),
                    UploadedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserPgpKeys", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserPgpKeys_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "E2eeChannelMembers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ChannelId = table.Column<int>(type: "integer", nullable: false),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    JoinedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_E2eeChannelMembers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_E2eeChannelMembers_E2eeChannels_ChannelId",
                        column: x => x.ChannelId,
                        principalTable: "E2eeChannels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_E2eeChannelMembers_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "E2eeGroupChannelKeys",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ChannelId = table.Column<int>(type: "integer", nullable: false),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    KeyVersion = table.Column<int>(type: "integer", nullable: false),
                    EncryptedAesKey = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_E2eeGroupChannelKeys", x => x.Id);
                    table.ForeignKey(
                        name: "FK_E2eeGroupChannelKeys_E2eeChannels_ChannelId",
                        column: x => x.ChannelId,
                        principalTable: "E2eeChannels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_E2eeGroupChannelKeys_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "E2eeMessages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ChannelId = table.Column<int>(type: "integer", nullable: false),
                    SenderId = table.Column<int>(type: "integer", nullable: false),
                    Ciphertext = table.Column<string>(type: "text", nullable: false),
                    KeyVersion = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_E2eeMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_E2eeMessages_E2eeChannels_ChannelId",
                        column: x => x.ChannelId,
                        principalTable: "E2eeChannels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_E2eeMessages_Users_SenderId",
                        column: x => x.SenderId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_E2eeChannelMembers_ChannelId_UserId",
                table: "E2eeChannelMembers",
                columns: new[] { "ChannelId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_E2eeChannelMembers_UserId",
                table: "E2eeChannelMembers",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_E2eeChannels_CreatedByUserId",
                table: "E2eeChannels",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_E2eeChannels_Name",
                table: "E2eeChannels",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_E2eeGroupChannelKeys_ChannelId_UserId_KeyVersion",
                table: "E2eeGroupChannelKeys",
                columns: new[] { "ChannelId", "UserId", "KeyVersion" });

            migrationBuilder.CreateIndex(
                name: "IX_E2eeGroupChannelKeys_UserId",
                table: "E2eeGroupChannelKeys",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_E2eeMessages_ChannelId_CreatedAt",
                table: "E2eeMessages",
                columns: new[] { "ChannelId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_E2eeMessages_SenderId",
                table: "E2eeMessages",
                column: "SenderId");

            migrationBuilder.CreateIndex(
                name: "IX_UserPgpKeys_UserId",
                table: "UserPgpKeys",
                column: "UserId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "E2eeChannelMembers");

            migrationBuilder.DropTable(
                name: "E2eeGroupChannelKeys");

            migrationBuilder.DropTable(
                name: "E2eeMessages");

            migrationBuilder.DropTable(
                name: "UserPgpKeys");

            migrationBuilder.DropTable(
                name: "E2eeChannels");
        }
    }
}

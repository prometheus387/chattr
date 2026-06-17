using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Chattr.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddMultiRoleAndVouches : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "VanitySlug",
                table: "Guilds",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VouchCount",
                table: "Guilds",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "VouchLevel",
                table: "Guilds",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "CanActivateCamera",
                table: "GuildRolePermissions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanActivateLivestream",
                table: "GuildRolePermissions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanConnectToVoice",
                table: "GuildRolePermissions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanDeleteOwnMessage",
                table: "GuildRolePermissions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanEditOwnMessage",
                table: "GuildRolePermissions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanSendMessage",
                table: "GuildRolePermissions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "ViewChatHistory",
                table: "GuildRolePermissions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Nickname",
                table: "GuildMembers",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "GuildMemberRoles",
                columns: table => new
                {
                    GuildMemberId = table.Column<int>(type: "integer", nullable: false),
                    RoleId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GuildMemberRoles", x => new { x.GuildMemberId, x.RoleId });
                    table.ForeignKey(
                        name: "FK_GuildMemberRoles_GuildMembers_GuildMemberId",
                        column: x => x.GuildMemberId,
                        principalTable: "GuildMembers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GuildMemberRoles_GuildRoles_RoleId",
                        column: x => x.RoleId,
                        principalTable: "GuildRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "GuildVouches",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    GuildId = table.Column<int>(type: "integer", nullable: false),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GuildVouches", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GuildVouches_Guilds_GuildId",
                        column: x => x.GuildId,
                        principalTable: "Guilds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GuildVouches_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Guilds_VanitySlug",
                table: "Guilds",
                column: "VanitySlug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GuildMemberRoles_RoleId",
                table: "GuildMemberRoles",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "IX_GuildVouches_GuildId_UserId",
                table: "GuildVouches",
                columns: new[] { "GuildId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GuildVouches_UserId",
                table: "GuildVouches",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GuildMemberRoles");

            migrationBuilder.DropTable(
                name: "GuildVouches");

            migrationBuilder.DropIndex(
                name: "IX_Guilds_VanitySlug",
                table: "Guilds");

            migrationBuilder.DropColumn(
                name: "VanitySlug",
                table: "Guilds");

            migrationBuilder.DropColumn(
                name: "VouchCount",
                table: "Guilds");

            migrationBuilder.DropColumn(
                name: "VouchLevel",
                table: "Guilds");

            migrationBuilder.DropColumn(
                name: "CanActivateCamera",
                table: "GuildRolePermissions");

            migrationBuilder.DropColumn(
                name: "CanActivateLivestream",
                table: "GuildRolePermissions");

            migrationBuilder.DropColumn(
                name: "CanConnectToVoice",
                table: "GuildRolePermissions");

            migrationBuilder.DropColumn(
                name: "CanDeleteOwnMessage",
                table: "GuildRolePermissions");

            migrationBuilder.DropColumn(
                name: "CanEditOwnMessage",
                table: "GuildRolePermissions");

            migrationBuilder.DropColumn(
                name: "CanSendMessage",
                table: "GuildRolePermissions");

            migrationBuilder.DropColumn(
                name: "ViewChatHistory",
                table: "GuildRolePermissions");

            migrationBuilder.DropColumn(
                name: "Nickname",
                table: "GuildMembers");
        }
    }
}

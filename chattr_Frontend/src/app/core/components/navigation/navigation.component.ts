import { AfterViewInit, ChangeDetectionStrategy, Component, OnInit } from "@angular/core";

import { NAVBAR_LINKS } from "../../constants/navigation.constants";
import { NavItem } from "../../models/nav-item";
import { RouterLink, RouterLinkActive, RouterLinkWithHref } from "@angular/router";

@Component({
    selector: "app-navigation",
    standalone: true,
    templateUrl: "./navigation.component.html",
    styleUrl: "./navigation.component.scss",
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, RouterLinkActive]
})
export class NavigationComponent implements OnInit {
    navLinks: NavItem[] = NAVBAR_LINKS;
    showMobileNav: boolean = false;

    toggleMobileNavStatus() {
        this.showMobileNav = !this.showMobileNav;
    }

    constructor() {
        
    }
    ngOnInit(): void {

    }
}
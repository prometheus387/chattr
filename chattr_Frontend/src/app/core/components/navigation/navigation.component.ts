import { AfterViewInit, ChangeDetectionStrategy, Component, OnInit } from "@angular/core";

@Component({
    selector: "app-navigation",
    standalone: true,
    templateUrl: "./navigation.component.html",
    styleUrl: "./navigation.component.scss",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavigationComponent implements OnInit {
    constructor() {
        
    }
    ngOnInit(): void {

    }
}
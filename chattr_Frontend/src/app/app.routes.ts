import { Routes } from '@angular/router';
import { MainComponent } from './core/pages/main/main.component';
import { ClientComponent } from './core/pages/client/client.component';
import { SupportComponent } from './core/pages/support/support.component';

export const routes: Routes = [
    { 
        path: "", 
        component: MainComponent,
        pathMatch: 'full'
    },
    {
        path: "client",
        component: ClientComponent,
    },
    {
        path: "support",
        component: SupportComponent,
    }
];

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClientComponent } from './client.component';

describe('Client', () => {
  let component: ClientComponent;
  let fixture: ComponentFixture<ClientComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClientComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ClientComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

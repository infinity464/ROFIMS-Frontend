import { FormControl } from '@angular/forms';
import { ipv4Validator } from './ipv4.validator';

describe('Optional IPv4 binding', () => {
  it('allows clearing and valid IPv4 addresses', () => {
    for (const value of [null, '', '  ', '192.168.0.10', ' 192.168.0.10 ', '0.0.0.0', '255.255.255.255']) {
      expect(ipv4Validator(new FormControl(value))).withContext(String(value)).toBeNull();
    }
  });

  it('rejects IPv6, ambiguous formats, invalid octets, lists, ports and ranges', () => {
    for (const value of ['::1', '::ffff:192.168.0.10', '256.1.1.1', '192.168.01.1', '127.1', '2130706433', 'localhost', '192.168.0.10:80', '192.168.0.0/24', '192.168.0.1,192.168.0.2']) {
      expect(ipv4Validator(new FormControl(value))).withContext(value).toEqual({ ipv4: true });
    }
  });
});

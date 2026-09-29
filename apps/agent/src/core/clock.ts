/** فرق ساعة الجهاز عن السيرفر، عشان تغيير ساعة الجهاز ما يأثرش على الحضور */
export class ServerClock {
  private offset = 0;

  sync(serverTimeIso: string, requestStart: number, requestEnd: number) {
    const server = Date.parse(serverTimeIso);
    if (Number.isNaN(server)) return;
    const localMid = (requestStart + requestEnd) / 2;
    this.offset = server - localMid;
  }

  now(local = Date.now()) {
    return local + this.offset;
  }

  get offsetMs() {
    return this.offset;
  }
}

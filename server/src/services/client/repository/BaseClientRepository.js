export default class BaseClientRepository {
  constructor(model) {
    this.model = model;
  }

  async create(clientData) {
    throw new Error("Method Not Implemented");
  }
}

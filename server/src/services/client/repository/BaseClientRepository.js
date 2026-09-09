export default class BaseClientRepository {
  constructor(model) {
    this.model = model;
  }

  async create(clientData) {
    throw new Error("Method Not Implemented");
  }

  async findById(clientId) {
    throw new Error("Method Not Implemented");
  }
  async findBySlug(slug) {
    throw new Error("Method Not Implemented");
  }
  async find(filters, options) {
    throw new Error("Method Not Implemented");
  }
  async count(filters) {
    throw new Error("Method Not Implemented");
  }
}
